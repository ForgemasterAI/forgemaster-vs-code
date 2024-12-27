import * as vscode from 'vscode';

class ForgemasterViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'forgemasterAI.sidebar';
    private _jwt: string | undefined;
    private _webviewView: vscode.WebviewView | undefined; // Store the webview
    constructor(private readonly _extensionUri: vscode.Uri) { }


    private getIframeUrl(): string {
        return vscode.workspace.getConfiguration('forgemasterAI').get('appUrl') || 'https://app.forgemaster.ai';
    }
    async resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken) {
        this._webviewView = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.onDidReceiveMessage(async message => {
            console.log('Received message from webview:', message); // Log all messages received

            switch (message.type) {
                case 'openExternal':
                    vscode.env.openExternal(vscode.Uri.parse(message.url));
                    break;
                case 'oauth-start':
                    const session = await vscode.authentication.getSession('forgemaster', ['profile'], { createIfNone: true });
                    if (session) {
                        this._jwt = session.accessToken;
                        await this.sendJwtToWebView(webviewView, this._jwt);
                    }
                    break;
                case 'request-jwt':
                    if (this._jwt) {
                        await this.sendJwtToWebView(webviewView, this._jwt);
                    }
                    break;
                case 'send-active-file':
                    this.sendActiveFileToWebView(webviewView);
                    break;

            }
        });
        if (this._jwt) {
            await this.sendJwtToWebView(webviewView, this._jwt);
        }
        webviewView.webview.html = `<!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy"
                      content="default-src 'none';
                               frame-src ${this.getIframeUrl()} https://*.linkedin.com https://*.github.com;
                               script-src 'unsafe-inline';
                               style-src 'unsafe-inline';">
                <style>
                   body, html { margin: 0; padding: 0; height: 100%; overflow: hidden; }
                     iframe { width: 100%; height: 100%; border: none; display: block; }
                </style>
                <script>
                    console.log('Webview loaded');
                    const vscode = acquireVsCodeApi();
                    // Listen for messages from iframe
                    window.addEventListener('message', event => {
                        console.log('Received message from iframe:', event.data);

                        if (event.data.type === 'link') {
                            vscode.postMessage({
                                type: 'openExternal',
                                url: event.data.url
                            });
                        }
                        if(event.data.type === 'selection-content'){
                            const selectedText = event.data.content;
                             console.log('Selected text:',selectedText);
                             document.querySelector('iframe')?.contentWindow?.postMessage({type:'selection-content', content:selectedText}, '*')
                        }
                         if (event.data.type === 'test-message') {
                             const message = event.data.content;
                             console.log('Recived message in webview', message)
                             document.querySelector('iframe')?.contentWindow?.postMessage({type:'test-message', message:message}, '*');
                            }
                    });

                   // Request JWT when iframe loads
                   window.addEventListener('load', () => {
                       vscode.postMessage({type:'request-jwt'});
                   });
                      document.addEventListener('DOMContentLoaded', () => {
                           console.log('DOMContentLoaded event fired.');
                        const iframe = document.querySelector('iframe');
                        if (iframe) {
                            const observer = new MutationObserver((mutations) => {
                                mutations.forEach((mutation) => {
                                    if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
                                        const newSrc = iframe.src;
                                        vscode.postMessage({
                                            type: 'navigate',
                                            url: newSrc
                                        });
                                    }
                                });
                            });
                            
                            try {
                                observer.observe(iframe, { attributes: true });
                                console.log('Successfully observing iframe');
                            } catch (error) {
                                console.error('Failed to observe iframe:', error);
                            }
                        } else {
                            console.error('iframe not found');
                        }
                    });

                </script>
            </head>
            <body>
                <iframe src="${this.getIframeUrl()}"></iframe>
            </body>
            </html>`;
    }
    async sendJwtToWebView(webviewView: vscode.WebviewView, jwt: string) {
        if (webviewView && jwt) {
            webviewView.webview.postMessage({ type: 'jwt', token: jwt });
        }
    }
    async sendActiveFileToWebView(webviewView: vscode.WebviewView) {
           if(webviewView){
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                const fileContent = activeEditor.document.getText();
                 webviewView.webview.postMessage({ type: 'active-file-content', content: fileContent });
            }
           }

    }

}




export function activate(context: vscode.ExtensionContext) {
    const provider = new ForgemasterViewProvider(context.extensionUri);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            ForgemasterViewProvider.viewType,
            provider
        )
    );

    const disposable = vscode.commands.registerCommand('forgemaster-ai.showWebview', () => {
        // Handle opening the panel as necessary
        // if(provider._webviewView){
        //    provider.sendActiveFileToWebView(provider._webviewView);
        // }
        
    });
       
const sendSelectionCommand = vscode.commands.registerCommand('forgemaster-ai.sendSelection', () => {
        console.log('sendSelectionCommand fired!');
        // if (provider._webviewView) {
        //     const editor = vscode.window.activeTextEditor;
        //     if (editor) {
        //         const selection = editor.selection;
        //         const selectedText = editor.document.getText(selection);
        //         provider._webviewView.webview.postMessage({ 
        //             type: 'selection-content', 
        //             content: selectedText 
        //         });
        //          console.log('Sent selection to webview:', selectedText);
        //     }
        // }
    });

    context.subscriptions.push(sendSelectionCommand);
    context.subscriptions.push(disposable);
}


export function deactivate() { }