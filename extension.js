const vscode = require('vscode');
const { execFileSync } = require('child_process');

// Создаем канал вывода (он будет виден в списке Output)
const outputChannel = vscode.window.createOutputChannel("Markdown Laconism");

function activate(context) {
    require('./fragment-editor').registerFragmentLinks(context);
    const installFileIncludes = require('./file-preview').createFilePreview(context);
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('markdown-laconism.commitUrlTemplate')) {
            vscode.commands.executeCommand('markdown.preview.refresh');
        }
    }));
    const config = vscode.workspace.getConfiguration('markdown-laconism');
    if (config.get('debug')) {
        const version = context.extension.packageJSON.version;
        outputChannel.appendLine(`[Main] Extension Activated v${version}`);
    }

        // Регистрируем провайдер для виртуальных документов схемы diff://
        const diffProvider = new class {
            provideTextDocumentContent(uri) {
                const commitHash = uri.authority || uri.path.replace(/^\//, '');
                if (!commitHash) return 'Error: No commit hash provided.';

                try {
                    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                    if (!workspaceRoot) return 'Error: No workspace folder open.';

                    // Запускаем git show без встроенных цветов (VS Code подсветит сам)
                    return execFileSync('git', ['show', '--color=never', '--end-of-options', commitHash, '--'], {
                        cwd: workspaceRoot,
                        encoding: 'utf-8'
                    });
                } catch (e) {
                    return `Error executing 'git show ${commitHash}':\n${e.message}`;
                }
            }
        };

        context.subscriptions.push(
            vscode.workspace.registerTextDocumentContentProvider('diff', diffProvider),
            
            // Автоматически включаем родную подсветку синтаксиса "diff" при открытии документа
            vscode.workspace.onDidOpenTextDocument(doc => {
                if (doc.uri.scheme === 'diff' && doc.languageId !== 'diff') {
                    vscode.languages.setTextDocumentLanguage(doc, 'diff');
                }
            })
        );

    // Регистрируем команды для умных ссылок find:// и launch://
    context.subscriptions.push(
        vscode.commands.registerCommand('markdown-laconism.launch', async (scenario) => {
            const folder = vscode.workspace.workspaceFolders?.[0];
            if (folder) {
                vscode.debug.startDebugging(folder, scenario);
            } else {
                vscode.window.showErrorMessage("Нет открытого workspace для отладки.");
            }
        }),
        vscode.commands.registerCommand('markdown-laconism.find', async (glob, regexStr) => {
            const files = await vscode.workspace.findFiles(glob, null, 1);
            if (files.length > 0) {
                const doc = await vscode.workspace.openTextDocument(files[0]);
                const editor = await vscode.window.showTextDocument(doc);
                if (regexStr) {
                    try {
                        const re = new RegExp(regexStr, 'm');
                        const match = re.exec(doc.getText());
                        if (match) {
                            const startPos = doc.positionAt(match.index);
                            const endPos = doc.positionAt(match.index + match[0].length);
                            editor.selection = new vscode.Selection(startPos, endPos);
                            editor.revealRange(new vscode.Range(startPos, endPos), vscode.TextEditorRevealType.InCenter);
                        }
                    } catch (e) {
                        console.error("Laconism regex error:", e);
                    }
                }
            } else {
                vscode.window.showWarningMessage(`Файл ${glob} не найден`);
            }
        })
    );

    return {
        extendMarkdownIt(md) {
            outputChannel.appendLine('[Main] VS Code requested markdown-it extension.');
            const plugin = require('./renderer');
            installFileIncludes(md);
            return plugin(md, outputChannel);
        }
    };
}

exports.activate = activate;
