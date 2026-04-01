const vscode = require('vscode');

// Создаем канал вывода (он будет виден в списке Output)
const outputChannel = vscode.window.createOutputChannel("Markdown Laconism");

function activate(context) {
    const config = vscode.workspace.getConfiguration('markdown-laconism');
    if (config.get('debug')) {
        const version = context.extension.packageJSON.version;
        outputChannel.appendLine(`[Main] Extension Activated v${version}`);
    }

    return {
        extendMarkdownIt(md) {
            outputChannel.appendLine('[Main] VS Code requested markdown-it extension.');
            const plugin = require('./renderer');
            return plugin(md, outputChannel);
        }
    };
}

exports.activate = activate;
