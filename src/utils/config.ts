import * as vscode from "vscode";

type IConfig = {
    settings: {
        appUrl: string;
        graphql:{
            endpoint: string;
        }
    }
}

export function getConfig(): IConfig {
    const config = vscode.workspace.getConfiguration('forgemasterAI');
    return {
        settings: {
            appUrl: config.get('appUrl') || '',
            graphql: {
                endpoint: config.get('graphql.endpoint') || ''
            }
        }
    };
}