import * as vscode from 'vscode';

class ForgemasterViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'forgemasterAI.sidebar';
    private _jwt: string | undefined;
     private _webviewView: vscode.WebviewView | undefined; // Store the webview
    constructor(private readonly _extensionUri: vscode.Uri) {}


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
            switch (message.type) {
                case 'openExternal':
                    // Handle external links (GitHub, LinkedIn, etc)
                    vscode.env.openExternal(vscode.Uri.parse(message.url));
                    break;
                case 'oauth-start':
                     // Step 1: Start OAuth flow
                     const session = await vscode.authentication.getSession('forgemaster', ['profile'], { createIfNone: true });
                     if(session){
                        this._jwt = session.accessToken
                         await this.sendJwtToWebView(webviewView, this._jwt);
                    }
                    break;
                  case 'request-jwt':
                        if(this._jwt) {
                           await this.sendJwtToWebView(webviewView, this._jwt);
                        }
                        break;

            }
        });
         if(this._jwt) {
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
                    const vscode = acquireVsCodeApi();
                    // Listen for messages from iframe
                    window.addEventListener('message', event => {
                        console.log('Received message:', event.data);

                        if (event.data.type === 'link') {
                            vscode.postMessage({
                                type: 'openExternal',
                                url: event.data.url
                            });
                        }

                        if (event.data.type === 'oauth') {
                            vscode.postMessage({
                                type: 'navigate',
                                url: event.data.url
                            });
                        }
                        if (event.data.type === 'request-jwt') {
                               vscode.postMessage({
                                type: 'request-jwt'
                                })
                             }
                    });

                   // Request JWT when iframe loads
                   window.addEventListener('load', () => {
                       vscode.postMessage({type:'request-jwt'});
                   });


                    // Observe iframe navigation
                    const iframe = document.querySelector('iframe');
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
                   observer.observe(iframe, { attributes: true });

                </script>
            </head>
            <body>
                <iframe src="${this.getIframeUrl()}"></iframe>
            </body>
            </html>`;
    }
     async sendJwtToWebView(webviewView: vscode.WebviewView, jwt: string) {
            if(webviewView && jwt) {
               webviewView.webview.postMessage({ type: 'jwt', token: jwt });
            }
         }
}


class JWTPanel {
    public static panel: vscode.WebviewPanel | undefined;
     public static readonly viewType = 'forgemasterAI.jwtPanel';
    public static createOrShow(extensionUri: vscode.Uri, jwt: string | undefined) {

        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

         // if panel already exists just reveal it
        if (JWTPanel.panel) {
            JWTPanel.panel.reveal(column);
            JWTPanel.panel.webview.postMessage({type: 'setJwt', value: jwt});
            return;
        }
        // create the panel
        JWTPanel.panel = vscode.window.createWebviewPanel(
            JWTPanel.viewType,
            'JWT Manager',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [extensionUri]
            }
        );

        JWTPanel.panel.webview.html = JWTPanel.getHtmlForWebview(extensionUri, jwt);

        JWTPanel.panel.onDidDispose(() => { JWTPanel.panel = undefined;},null);

        JWTPanel.panel.webview.onDidReceiveMessage(async message => {
            switch (message.type) {
                case 'jwtSubmit':
                  if(message.jwt) {
                         // Store the JWT
                      await vscode.commands.executeCommand('forgemaster-ai.setJwt', message.jwt);
                         JWTPanel.panel?.dispose();
                    }
                    break;
                 case 'jwtClear':
                     // Clear the stored JWT
                      await vscode.commands.executeCommand('forgemaster-ai.setJwt', undefined);
                      JWTPanel.panel?.dispose();
                     break;
            }
        });
     }

     private static getHtmlForWebview(extensionUri: vscode.Uri, jwt: string | undefined) {
         const nonce = getNonce();
      return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
             <meta http-equiv="Content-Security-Policy" 
                      content="default-src 'none'; 
                              script-src 'nonce-${nonce}';
                              style-src 'nonce-${nonce}';">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>JWT Input</title>
               <style nonce="${nonce}">
                    body { font-family: sans-serif; margin: 20px; }
                    textarea { width: 100%; min-height: 100px; margin-bottom: 10px; }
                    button { background-color: #4CAF50; color: white; padding: 10px 15px; border: none; cursor: pointer; }
                      .clear-button { background-color: #f44336; color: white; padding: 10px 15px; border: none; cursor: pointer; }
                </style>
        </head>
        <body>
            <h2>Enter your JWT</h2>
            <textarea id="jwtInput" placeholder="Paste your JWT here">${jwt ?? ''}</textarea>
            <br/>
            <button id="submitJwt">Submit JWT</button>
           <button id="clearJwt" class="clear-button">Clear JWT</button>
            <script nonce="${nonce}">
                  const vscode = acquireVsCodeApi();
                 document.getElementById('submitJwt').addEventListener('click', () => {
                    const jwt = document.getElementById('jwtInput').value;
                    vscode.postMessage({ type: 'jwtSubmit', jwt });
                   });
                    document.getElementById('clearJwt').addEventListener('click', () => {
                    vscode.postMessage({ type: 'jwtClear' });
                   });
                      window.addEventListener('message', event => {
                        if (event.data.type === 'setJwt') {
                            const jwtInput = document.getElementById('jwtInput');
                             jwtInput.value = event.data.value;
                        }
                    });
            </script>
        </body>
        </html>`;
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
     const disposablePanel = vscode.commands.registerCommand('forgemaster-ai.showJwtPanel', async () => {
            JWTPanel.createOrShow(context.extensionUri, provider._jwt);
        });


      const disposableSetJwt = vscode.commands.registerCommand('forgemaster-ai.setJwt', async (jwt: string | undefined) => {
           provider._jwt = jwt;
           if(provider._webviewView) {
              provider.sendJwtToWebView(provider._webviewView, jwt);
             }
       });


    const disposable = vscode.commands.registerCommand('forgemaster-ai.showWebview', () => {
        // Handle opening the panel as necessary
    });


    context.subscriptions.push(disposable, disposablePanel, disposableSetJwt);
}


export function deactivate() {}


function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}