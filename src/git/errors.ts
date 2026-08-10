/** An operation failure whose message is printed verbatim, git-style, in the terminal. */
export class GitOpError extends Error {
  constructor(
    message: string,
    public exitCode: number = 1,
  ) {
    super(message);
    this.name = "GitOpError";
  }
}
