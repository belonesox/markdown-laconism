const vscode = require('vscode');
const { execSync } = require('child_process');

// Создаем канал вывода (он будет виден в списке Output)
const outputChannel = vscode.window.createOutputChannel("Markdown Laconism");

function activate(context) {
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
                    return execSync(`git show --color=never ${commitHash}`, {
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

    return {
        extendMarkdownIt(md) {
            outputChannel.appendLine('[Main] VS Code requested markdown-it extension.');
            const plugin = require('./renderer');
            return plugin(md, outputChannel);
        }
    };
}

exports.activate = activate;
