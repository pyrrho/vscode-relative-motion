# Relative Motion for VSCode

Like 'Go to Line/Column' but relative instead of absolute; vaguely vim-like cursor-relative line jumping through the Command Pallette.

Inspiration was taken from the built-in 'Go to Line/Column' (`workbench.action.gotoLine`) command for the interface and feedback, as well as [EnkelDigital] and [JJ Lee]'s [relativity] extension for the general behavior.

[EnkelDigital]: https://github.com/Enkel-Digital/
[JJ Lee]: https://github.com/Jaimeloeuf
[relativity]: https://marketplace.visualstudio.com/items?itemName=EnkelDigital.relativity


## Features

Provides the following commands;

| Action                         | Keybinding       | Command                       |
| :-----                         | ----------       | :------                       |
| Relative Motion: Navigate Up   | <kbd>alt+k</kbd> | `vscode-relative-motion.up`   |
| Relative Motion: Navigate Down | <kbd>alt+j</kbd> | `vscode-relative-motion.down` |

The Command Pallette will then accept input in the form;

| Input | Operation                               |
| :---- | :--------                               |
| `2`   | Moves up/down 2 rows                    |
| `4#3` | Moves up/down 4 rows, moves to column 3 |
| `6:5` | Moves up/down 6 rows, moves to column 5 |
| `8,7` | Moves up/down 8 rows, moves to column 7 |

![Relative Motion Demo](images/vscode-relative-motion-demo.gif)


## Extension Settings

* `relativeMotion.previewRelativeLineNumbers`: Render relative line numbers when previewing Relative Motion's navigation.


## Known Issues

- `previewRelativeLineNumbers` interacts poorly with the `"editor.lineNumbers" = "interval"`.

  tl;dr - if the active editor is rendering `"interval"` line numbers, `previewRelativeLineNumbers` is ignored.  
  This is because `vscode.window.activeTextEditor.options.lineNumbers` doesn't understand the `interval` configuration, the below sequence;

  ```typescript
  const previousSetting = vscode.window.activeTextEditor.options.lineNumbers;
  vscode.window.activeTextEditor.options.lineNumbers = TextEditorLineNumbersStyle.Relative;
  vscode.window.activeTextEditor.options.lineNumbers = previousSetting;
  ```
  will result in line numbers being rendered as `"on"` rather than `"interval"`.  
  See [VSCode #198787][198787].

- Multi-cursor support.  
  'Go to Line/Column' doesn't bother moving multiple cursors. Should Relative Motion?

If you find something wrong with this extension or have a feature request, please open an [issue] with a detailed description and, if applicable, minimal reproduction case.

[issue]: https://github.com/pyrrho/vscode-relative-motion/issues/new/choose
[198787]: https://github.com/microsoft/vscode/pull/198787


## Release Notes

### 0.1.0

Proof-of-Concept commands thunked into an official home!
