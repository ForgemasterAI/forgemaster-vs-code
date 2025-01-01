import * as vscode from 'vscode';
import { getConfig } from './utils/config';
import { InlineCompletionProvider } from './inlineCompletionItemProvider';

class ForgemasterViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'forgemasterAI.sidebar';
    private __webviewView!: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _secretStorage: vscode.SecretStorage
    ) { }

    private getIframeUrl(): string {
        const envUrl = process.env.FORGEMASTER_APP_URL;
        const config = getConfig();
        
        if (envUrl) {
            return envUrl;
        }
    
        return config.settings.appUrl || 'https://app.forgemaster.ai';
    }

    async resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this.__webviewView = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        // Retrieve existing API Key
        const existingApiKey = await this._secretStorage.get('forgemasterAPIKey');
        const isApiKeySaved = !!existingApiKey;
        

        webviewView.webview.onDidReceiveMessage(async message => {
            switch (message.type) {
                case 'openExternal':
                    vscode.env.openExternal(vscode.Uri.parse(message.url));
                    break;
                case 'save-api-key':
                    await this._secretStorage.store('forgemasterAPIKey', message.apiKey);
                    vscode.window.showInformationMessage('API Key saved successfully.');
                    break;
                case 'request-jwt':
                    console.debug('Requesting JWT...');
                    const apiKey = await this._secretStorage.get('forgemasterAPIKey');
                    webviewView.webview.postMessage({ type: 'jwt', apiKey });
                    break;
                default:
                    break;
            }
        });

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
                body, html {
                    margin: 0;
                    padding: 0;
                    height: 100%;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    font-family: var(--vscode-font-family, sans-serif);
                    background-color: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                }
                #api-key-container {
                    padding: 10px;
                    background-color: var(--vscode-editor-background);
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    border-bottom: 1px solid var(--vscode-editorGroup-border);
                }
                #api-key-input {
                    flex: 1;
                    padding: 5px 10px;
                    border: 1px solid var(--vscode-editorWidget-border);
                    border-radius: 4px;
                    background-color: var(--vscode-editorWidget-background);
                    color: var(--vscode-editor-foreground);
                }
                #api-key-input::placeholder {
                    color: var(--vscode-input-placeholderForeground);
                }
                #toggle-api-key {
                    padding: 5px 10px;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    font-size: 14px;
                }
                #toggle-api-key:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                #app-container {
                    flex: 1;
                }
                iframe {
                    width: 100%;
                    height: 100%;
                    border: none;
                    display: block;
                }
            </style>
            <script>
                const vscode = acquireVsCodeApi();
                const isApiKeySaved = ${isApiKeySaved};

                // Update button text based on API Key existence
                function updateButtonText() {
                    const toggleButton = document.getElementById('toggle-api-key');
                    toggleButton.innerText = isApiKeySaved ? 'Change API Key' : 'Enter API Key';
                }

                // Toggle API Key input visibility
                function toggleApiKey() {
                    const container = document.getElementById('api-key-container');
                    if (container.style.display === 'none') {
                        container.style.display = 'flex';
                    } else {
                        container.style.display = 'none';
                    }
                }

                // Save API Key
                function saveApiKey() {
                    const apiKey = document.getElementById('api-key-input').value;
                    vscode.postMessage({ type: 'save-api-key', apiKey });
                    // Optionally update button text after saving
                    updateButtonText();
                    // if api key is saved save it to local storage
                    localStorage.setItem('forgemasterAPIKey', apiKey);
                }

                // Listen for messages from iframe
                window.addEventListener('message', event => {
                    if (!event.data) {
                        return;
                    }
                    const message = event.data;
                    if (message.type === 'link') {
                        vscode.postMessage({
                            type: 'openExternal',
                            url: message.url
                        });
                    }
                    if (message.type === 'selection-content') {
                        const selectedText = message.content;
                        document.querySelector('iframe')?.contentWindow?.postMessage({ type: 'selection-content', content: selectedText }, '*');
                    }
                    if (message.type === 'test-message') {
                        const testMessage = message.content;
                        document.querySelector('iframe')?.contentWindow?.postMessage({ type: 'test-message', message: testMessage }, '*');
                    }
                });

                // Request JWT when iframe loads
                window.addEventListener('load', () => {
                    vscode.postMessage({ type: 'request-jwt' });
                });

                document.addEventListener('DOMContentLoaded', () => {
                    updateButtonText();
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
            <button id="toggle-api-key" onclick="toggleApiKey()">Enter API Key</button>
            <div id="api-key-container" style="display: none;">
                <input type="password" id="api-key-input" placeholder="Enter API Key" />
                <button onclick="saveApiKey()">Save</button>
            </div>
            <div id="app-container">
                <iframe src="${this.getIframeUrl()}"></iframe>
            </div>
        </body>
        </html>`;
    }
}



export function activate(context: vscode.ExtensionContext) {
    const frameProvider = new ForgemasterViewProvider(context.extensionUri, context.secrets);

    // Register the inline completion provider
    vscode.languages.registerInlineCompletionItemProvider(
        { pattern: '**' }, // Apply to all languages, adjust as needed
        new InlineCompletionProvider(context.secrets),
    );
    
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            ForgemasterViewProvider.viewType,
            frameProvider
        )
    );
  
}

export function deactivate() { }