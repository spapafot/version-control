"""DynamoDB access layer — single table, lazy module-level Table handle.

Item layout (PK / SK):
  USER#{sub} / PROFILE            {email, displayName?, createdAt, updatedAt}
  USER#{sub} / PROGRESS           {completed, hintsUsed, achievements, v, syncedAt}
  USER#{sub} / CERTREF#VC-GIT-F   {certId, issuedOn}
  CERT#{id}  / CERT               {sub, recipientName, issuedOn, skills,
                                   credentialJson, jws, salt, revoked}
"""

from __future__ import annotations

from decimal import Decimal
from typing import Optional

import boto3
from boto3.dynamodb.conditions import Attr, Key
from botocore.exceptions import ClientError

from .config import get_settings

CERTREF_SK = "CERTREF#VC-GIT-F"

_table = None


def get_table():
    global _table
    if _table is None:
        settings = get_settings()
        _table = boto3.resource("dynamodb", region_name=settings.aws_region).Table(
            settings.table_name
        )
    return _table


def reset() -> None:
    """Drop the cached Table handle (tests recreate it inside moto)."""
    global _table
    _table = None


class ConditionalWriteFailed(Exception):
    """Optimistic-lock conflict on the PROGRESS item."""


class CertIdCollision(Exception):
    """The freshly generated credential id already exists."""


class CertRefRace(Exception):
    """Another request issued this user's certificate first."""


def _clean(value):
    """Recursively convert DynamoDB Decimals back to ints (we only store ints)."""
    if isinstance(value, Decimal):
        return int(value)
    if isinstance(value, dict):
        return {k: _clean(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_clean(v) for v in value]
    return value


def get_user_items(sub: str) -> list:
    resp = get_table().query(KeyConditionExpression=Key("PK").eq(f"USER#{sub}"))
    return [_clean(item) for item in resp.get("Items", [])]


def get_profile(sub: str) -> Optional[dict]:
    resp = get_table().get_item(Key={"PK": f"USER#{sub}", "SK": "PROFILE"})
    item = resp.get("Item")
    return _clean(item) if item else None


def put_profile(
    sub: str, *, email: str, now: str, display_name: Optional[str] = None
) -> None:
    """Upsert the PROFILE item, preserving email/createdAt once set."""
    update = (
        "SET #email = if_not_exists(#email, :email), "
        "#createdAt = if_not_exists(#createdAt, :now), #updatedAt = :now"
    )
    names = {"#email": "email", "#createdAt": "createdAt", "#updatedAt": "updatedAt"}
    values = {":email": email, ":now": now}
    if display_name is not None:
        update += ", #displayName = :dn"
        names["#displayName"] = "displayName"
        values[":dn"] = display_name
    get_table().update_item(
        Key={"PK": f"USER#{sub}", "SK": "PROFILE"},
        UpdateExpression=update,
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=values,
    )


def get_progress(sub: str) -> Optional[dict]:
    resp = get_table().get_item(Key={"PK": f"USER#{sub}", "SK": "PROGRESS"})
    item = resp.get("Item")
    return _clean(item) if item else None


def put_progress_conditional(
    sub: str, progress: dict, read_v: Optional[int], synced_at: str
) -> int:
    """Write PROGRESS with optimistic locking on ``v``.

    ``read_v`` is the version observed before merging (None when the item did
    not exist). Raises ``ConditionalWriteFailed`` on a concurrent update.
    """
    new_v = (read_v or 0) + 1
    item = {
        "PK": f"USER#{sub}",
        "SK": "PROGRESS",
        "completed": progress["completed"],
        "hintsUsed": progress["hintsUsed"],
        "achievements": progress["achievements"],
        "v": new_v,
        "syncedAt": synced_at,
    }
    condition = (
        Attr("PK").not_exists() if read_v is None else Attr("v").eq(read_v)
    )
    try:
        get_table().put_item(Item=item, ConditionExpression=condition)
    except ClientError as exc:
        if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
            raise ConditionalWriteFailed() from exc
        raise
    return new_v


def get_certref(sub: str) -> Optional[dict]:
    resp = get_table().get_item(Key={"PK": f"USER#{sub}", "SK": CERTREF_SK})
    item = resp.get("Item")
    return _clean(item) if item else None


def get_cert(cert_id: str) -> Optional[dict]:
    resp = get_table().get_item(Key={"PK": f"CERT#{cert_id}", "SK": "CERT"})
    item = resp.get("Item")
    return _clean(item) if item else None


def issue_cert_transaction(cert_item: dict, certref_item: dict) -> None:
    """Atomically create CERT + CERTREF; both Puts are create-only.

    Raises ``CertIdCollision`` when the CERT id is taken (caller retries with a
    new id) or ``CertRefRace`` when the user already holds a CERTREF (caller
    re-reads and returns the winner).
    """
    settings = get_settings()
    # The resource-derived client carries boto3's document-interface
    # transformation, so items are passed as native Python types.
    client = get_table().meta.client
    try:
        client.transact_write_items(
            TransactItems=[
                {
                    "Put": {
                        "TableName": settings.table_name,
                        "Item": cert_item,
                        "ConditionExpression": "attribute_not_exists(PK)",
                    }
                },
                {
                    "Put": {
                        "TableName": settings.table_name,
                        "Item": certref_item,
                        "ConditionExpression": "attribute_not_exists(SK)",
                    }
                },
            ]
        )
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "TransactionCanceledException":
            raise
        reasons = exc.response.get("CancellationReasons") or []
        codes = [
            (reason or {}).get("Code") for reason in reasons
        ]
        if len(codes) >= 2 and codes[1] == "ConditionalCheckFailed":
            raise CertRefRace() from exc
        if len(codes) >= 1 and codes[0] == "ConditionalCheckFailed":
            raise CertIdCollision() from exc
        # Reasons unavailable (some emulators omit them): let the caller
        # re-read the CERTREF and fall back to a retry when it is absent.
        raise CertRefRace() from exc
