const vscode = require('vscode');
const { editorLinks, localFragment, findFragment } = require('./text-fragments');

function registerFragmentLinks(context) {
    const command = 'markdown-laconism.openTextFragment';
    context.subscriptions.push(vscode.languages.registerDocumentLinkProvider('markdown', {
        provideDocumentLinks(doc) {
            return editorLinks(doc.getText()).map(({ from, to, href }) => {
                const args = encodeURIComponent(JSON.stringify([doc.uri.toString(), href]));
                return new vscode.DocumentLink(new vscode.Range(doc.positionAt(from), doc.positionAt(to)),
                    vscode.Uri.parse('command:' + command + '?' + args));
            });
        }
    }), vscode.commands.registerCommand(command, async (source, href) => {
        try {
            const base = vscode.Uri.parse(source);
            const fragment = localFragment(href);
            if (!fragment || !['file', 'vscode-remote'].includes(base.scheme)) return;
            const file = decodeURIComponent(fragment.src);
            const folder = vscode.workspace.getWorkspaceFolder(base);
            const uri = file.startsWith('/') && folder ? vscode.Uri.joinPath(folder.uri, file.slice(1))
                : file.startsWith('/') ? base.with({ path: file }) : vscode.Uri.joinPath(base, '..', file);
            const doc = await vscode.workspace.openTextDocument(uri);
            let match;
            try {
                match = findFragment(doc.getText(), fragment.directive);
            } catch (error) {
                await vscode.window.showTextDocument(doc);
                throw error;
            }
            const selection = new vscode.Range(doc.positionAt(match.start), doc.positionAt(match.end));
            await vscode.window.showTextDocument(doc, { selection });
            if (match.ambiguous) vscode.window.showWarningMessage('Text fragment matches more than once. Showing the first match.');
        } catch (error) {
            vscode.window.showWarningMessage(String(error.message || error));
        }
    }));
}

module.exports = { registerFragmentLinks };
