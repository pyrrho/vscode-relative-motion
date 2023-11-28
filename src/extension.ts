import * as vscode from "vscode";

export async function activate(context: vscode.ExtensionContext) {
  const registeredMoveUp = vscode.commands.registerCommand(
    "vscode-relative-motion.up",
    () => {
      const editor = vscode.window.activeTextEditor;

      // If the current editor is undefined (meaning user focus not on a editor),
      // print a message and ignore input.
      if (!editor) {
        createNonEditorInputBox().show();
        return;
      }
      createInputBox(editor, 'up').show();
    });
  const registeredMoveDown = vscode.commands.registerCommand(
    "vscode-relative-motion.down",
    () => {
      const editor = vscode.window.activeTextEditor;

      // If the current editor is undefined (meaning user focus not on a editor),
      // print a message and ignore input.
      if (!editor) {
        createNonEditorInputBox().show();
        return;
      }
      createInputBox(editor, 'down').show();
    });

  context.subscriptions.push(registeredMoveUp);
  context.subscriptions.push(registeredMoveDown);
}

export function deactivate() {
  // No clean up code required for this extension
}


// ** DECORATIONS *********************************************************** //
// https://code.visualstudio.com/api/references/vscode-api#TextEditorDecorationType

/**
 * Decoration to highlight a targeted line.
 */
const LINE_HIGHLIGHT = vscode.window.createTextEditorDecorationType(
  {
    isWholeLine: true,
    backgroundColor: new vscode.ThemeColor("editor.lineHighlightBackground"),
  }
);

/**
 * Highlight the line at the given position.
 *
 * @param editor The editor in which to highlight.
 * @param targetPosition The position to highlight.
 */
function setHighlight(editor: vscode.TextEditor, targetPosition: vscode.Position) {
  editor.setDecorations(
    LINE_HIGHLIGHT,
    [new vscode.Range(targetPosition, targetPosition)]);
}

/**
 * Clear any highlight in the editor.
 *
 * @param editor The editor in which to clear the highlight.
 */
function clearHighlight(editor: vscode.TextEditor) {
  editor.setDecorations(LINE_HIGHLIGHT, []);
}


// ** HELPERS *************************************************************** //

/**
 * Parse a string in the form of `lines`, `lines,col`, `lines:col`, or
 * `lines#col` into their numeric representations. If there is no valid input,
 * both `inputLines` and `inputColumn` will be `undefined`.
 *
 * NB. This implementation will allow non-numeric input to be ignored, and
 * accept numeric input at any split index. ex; `'abc:123:xyz:456'` will be
 * parsed as `[123,456]`. This is probably not a good characteristic.
 * It's fast, tho.
 *
 * @param value Text input by the user.
 * @returns An object with numeric lines and column.
 */
function parseInput(value: string): {
  inputLines: number | undefined,
  inputColumn: number | undefined,
} {
  const numbers = value
    .split(/,|:|#|\s/)
    .map(part => parseInt(part, 10))
    .filter(part => !isNaN(part));

  return { inputLines: numbers[0], inputColumn: numbers[1] };
}

/**
 * Helper to make optional pluralization easier.
 *
 * @param n A number
 * @returns '' if n === 1; otherwise returns 's'.
 */
function s(n: number): string {
  return n === 1 ? '' : 's';
}

// ** CORE LOGIC ************************************************************ //

/**
 * Creates an input box for non-navigable editors
 *
 * @returns An input box that will display a message indicating that the user
 *          should open an navigable text editor before using this extension.
 */
function createNonEditorInputBox(): vscode.InputBox {
  const inputBox = vscode.window.createInputBox();

  inputBox.prompt = "Open a text editor first to go to a line.";
  inputBox.onDidAccept(() => {
    inputBox.hide();
  });

  return inputBox;
}

/**
 * Create an input box that will let users preview and perform a relative-goto
 * navigation operation.
 *
 * @param editor The editor in which to preform the relative-goto.
 * @param direction the direction to navigate; either 'up' or 'down'.
 * @returns An input box that will control the relative-goto operation.
 */
function createInputBox(
  editor: vscode.TextEditor,
  direction: 'up' | 'down',
): vscode.InputBox {

  // Optionally override line number rendering to be relative instead of
  // absolute while the input box is open.
  const initialLineNumberOption = editor.options.lineNumbers;
  const renderRelativeNumbers = vscode
    .workspace
    .getConfiguration('relativeMotion')
    .get<boolean>('previewRelativeLineNumbers') ?? true;

  // FIXME: Work around not being able to differentiate between line numbers
  //        being set to 'on' vs 'interval' through the `editor.options` member
  //        bt reading the workspace configuration directly. If line numbers are
  //        set to 'interval', we're going to not do the override, because we
  //        would either 1. need to edit a workspace or global configuration
  //        file to turn the interval on/off, or 2. we would accidentally return
  //        the line numbers configuration to 'on' instead of 'interval' by
  //        assigning ` editor.options.lineNumbers = 1;`.
  const initialLineNumberConfig = vscode
    .workspace
    .getConfiguration('editor')
    .get('lineNumbers');

  if (renderRelativeNumbers && initialLineNumberConfig === 'on') {
    editor.options.lineNumbers = vscode.TextEditorLineNumbersStyle.Relative;
  }

  // Capture the current visible range and selection as our final targets s.t.
  // when an input box is canceled we can restore the editor to its prior state.
  // FIXME: When will `.visibleRanges.length` be > 1?
  let finalRange = editor.visibleRanges[0];
  let finalSelection = editor.selection;

  const inputBox = vscode.window.createInputBox();
  inputBox.prompt = getPrompt(editor, direction);

  // When user input is given, attempt to update the prompt and visible range to
  // reflect the state of the editor if the users accepts the input.
  inputBox.onDidChangeValue((value) => {
    // Don't persist highlights that were created in a previous update.
    clearHighlight(editor);

    const { inputLines, inputColumn } = parseInput(value);
    const sanitizedInput = sanitizeInput(
      editor,
      direction,
      inputLines,
      inputColumn);

    // If input is unset or invalid for any reason, show the default
    // prompt message.
    if (sanitizedInput === undefined) {
      inputBox.prompt = getPrompt(editor, direction);
      return;
    }

    // If input would result in a translation, update the prompt to describe
    // the move...
    const { lines, column, targetPosition } = sanitizedInput;
    inputBox.prompt = getPrompt(
      editor,
      direction,
      lines,
      column,
      targetPosition);

    // ... highlight the target line (if the current cursor isn't already
    // highlighting that line) ...
    if (targetPosition.line !== editor.selection.active.line) {
      setHighlight(editor, targetPosition);
    }

    // ... and ensure the target position is visible.
    editor.revealRange(
      new vscode.Range(targetPosition, targetPosition),
      vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  });

  // On accept, update the final targets based on the input, and dispose of the
  // input box.
  inputBox.onDidAccept(() => {
    const { inputLines, inputColumn } = parseInput(inputBox.value);
    const sanitizedInput = sanitizeInput(
      editor,
      direction,
      inputLines,
      inputColumn);

    if (sanitizedInput !== undefined) {
      const { targetPosition } = sanitizedInput;
      finalRange = new vscode.Range(targetPosition, targetPosition);
      finalSelection = new vscode.Selection(targetPosition, targetPosition);
    }

    // NB. Invokes `onDidHide` before disposing the input box.
    inputBox.dispose();
  });

  // On exit -- due to either an accept or cancel -- clear any previous
  // highlights and move the visible range and selection to the final targets.
  inputBox.onDidHide(() => {
    // Restore the line number configuration to its initial state.
    if (renderRelativeNumbers && initialLineNumberConfig === 'on') {
      editor.options.lineNumbers = initialLineNumberOption;
    }

    clearHighlight(editor);
    editor.revealRange(finalRange, vscode.TextEditorRevealType.Default);
    editor.selection = finalSelection;
  });

  return inputBox;
}

/**
 * Sanitize inputs to ensure that the proposed relative-goto is valid. If the
 * relative-goto is valid, return an object with known-valid lines to move,
 * column to move to, and final target position.
 *
 * @param editor The editor in which to validate the relative-goto.
 * @param direction The direction to navigate; either 'up' or 'down'.
 * @param inputLines The given number of lines to navigate.
 * @param inputColumn The given column to navigate to.
 * @returns `undefined` if the relative-goto is invalid, or an object with
 *          known-good targets.
 */
function sanitizeInput(
  editor: vscode.TextEditor,
  direction: 'up' | 'down',
  inputLines: number | undefined,
  inputColumn: number | undefined,
): {
  lines: number,
  column: number | undefined,
  targetPosition: vscode.Position,
} | undefined {
  const currentPosition = editor.selection.active;

  if (inputLines === undefined) {
    return;
  }

  const offsetToBeginning = currentPosition.line;
  const offsetToEnd = currentPosition.line - editor.document.lineCount + 1;

  const forwardLimit = direction === 'up' ? offsetToBeginning : -offsetToEnd;
  const backwardLimit = direction === 'up' ? offsetToEnd : -offsetToBeginning;

  const isValidLines = backwardLimit <= inputLines && inputLines <= forwardLimit;

  if (!isValidLines) {
    return;
  }

  const targetLine = direction === 'up'
    ? currentPosition.line - inputLines
    : currentPosition.line + inputLines;
  const targetLineLength = editor.document.lineAt(targetLine).text.length;

  if (inputColumn === undefined) {
    const targetColumn = currentPosition.character > targetLineLength
      ? targetLineLength
      : currentPosition.character;

    return {
      lines: inputLines,
      column: undefined,
      targetPosition: new vscode.Position(targetLine, targetColumn),
    };
  }

  // FIXME: Is column an absolute or relative position? Should columnar movement
  //        be allowed at all?
  // FIXME: Should targetColumn be capped, or is an invalid value `undefined`?
  const targetColumn = inputColumn <= 1
    ? 1
    : inputColumn <= targetLineLength + 1
      ? inputColumn
      : targetLineLength + 1;

  return {
    lines: inputLines,
    column: targetColumn,
    targetPosition: new vscode.Position(targetLine, targetColumn - 1),
  };
}

/**
 * Generate a prompt that will describe the proposed relative-goto operation, or
 * describe the range of valid inputs for a relative-goto.
 *
 * @param editor The editor in which to perform the relative-goto.
 * @param direction The direction being navigated; either 'up' or 'down'.
 * @param lines Optionally a number of lines to navigate.
 * @param column Optionally the column to navigate to.
 * @param targetPosition Optionally the final target position.
 * @returns A message to display in the input box.
 */
function getPrompt(
  editor: vscode.TextEditor,
  direction: 'up' | 'down',
  lines?: number,
  column?: number,
  targetPosition?: vscode.Position,
): string {
  if (lines === undefined || targetPosition === undefined) {
    const currentPosition = editor.selection.active;
    const currentLine = currentPosition.line + 1;
    const currentColumn = currentPosition.character + 1;

    const offsetToBeginning = currentPosition.line;
    const offsetToEnd = currentPosition.line - editor.document.lineCount + 1;

    if (direction === 'up') {
      return `Current Line: ${currentLine}, Character: ${currentColumn}. `
        + `Type a number between ${offsetToBeginning} and ${offsetToEnd} to `
        + `navigate ${direction} by.`;
    } else {
      return `Current Line: ${currentLine}, Character: ${currentColumn}. `
        + `Type a number between ${-offsetToEnd} and ${-offsetToBeginning} to `
        + `navigate ${direction} by.`;
    }
  }

  const targetLine = targetPosition.line + 1;
  const targetColumn = targetPosition.character + 1;

  const targetDirection = lines >= 0
    ? direction
    : direction === 'up'
      ? 'down'
      : 'up';
  const targetLines = lines >= 0 ? lines : -lines;

  if (column === undefined) {
    return `Go ${targetDirection} ${targetLines} line${s(targetLines)} `
      + `(to line ${targetLine})`;
  }
  return `Go ${targetDirection} ${targetLines} line${s(targetLines)} `
    + `(to line ${targetLine} and character ${targetColumn}).`;
}