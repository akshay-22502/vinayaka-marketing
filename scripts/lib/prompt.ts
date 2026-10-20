/**
 * Asks for a secret on the terminal without showing it. Each typed character is read in raw
 * mode, so the terminal does not echo it, and nothing is written for it (not even stars).
 * Backspace works; Enter finishes; Ctrl-C stops the script. Needs a terminal on stdin: check
 * `process.stdin.isTTY` first, because without one there is nobody to ask.
 *
 * The prompt goes to stderr, so stdout stays clean for scripts that capture it.
 */
export function promptHidden(question: string): Promise<string> {
  const { stdin, stderr } = process;

  return new Promise((resolve) => {
    let value = "";

    function finish(): void {
      stdin.removeListener("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stderr.write("\n");
    }

    function onData(chunk: string): void {
      // An arrow or function key arrives as one chunk starting with ESC: ignore it whole.
      if (chunk.startsWith("\u001b")) return;
      for (const char of chunk) {
        if (char === "\r" || char === "\n" || char === "\u0004") {
          finish();
          resolve(value);
          return;
        }
        if (char === "\u0003") {
          finish();
          process.exit(130);
        }
        if (char === "\u007f" || char === "\b") {
          value = value.slice(0, -1);
        } else if (char >= " ") {
          value += char;
        }
      }
    }

    // Raw mode first, then the question, so nothing typed in reply to it can be echoed.
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.resume();
    stdin.on("data", onData);
    stderr.write(question);
  });
}
