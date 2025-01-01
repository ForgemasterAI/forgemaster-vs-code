import * as vscode from 'vscode';

export function debounce<T extends (...args: any[]) => Promise<any>>(func: T, delay: number) {
    let timeoutId: NodeJS.Timeout | undefined;
    return async function (this: any, ...args: Parameters<T>): Promise<ReturnType<T> | undefined> {
        clearTimeout(timeoutId);
        return new Promise(resolve => {
            timeoutId = setTimeout(async () => {
                const result = await func.apply(this, args);
                resolve(result);
            }, delay);
        });
    };
}


// Replace with your actual GraphQL mutation string
const CREATE_CODE_COMPLETION_MUTATION = `
  mutation CreateCodeCompletion($codeContext: JSONObject!) {
    createCodeCompletion(codeContext: $codeContext)
  }
`;

// Function to make the GraphQL request
export async function fetchCodeCompletion(codeContext: any, apiKey: string | undefined): Promise<string | undefined> {
  try {
    // get from config  "forgemasterAI.settings.graphql.endpoint"
    const GRAPHQL_ENDPOINT = vscode.workspace.getConfiguration('forgemasterAI.settings').get('graphql.endpoint') as string;
    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey ? `Bearer ${apiKey}` : '', // Include API key if needed
      },
      body: JSON.stringify({
        query: CREATE_CODE_COMPLETION_MUTATION,
        variables: {
          codeContext
        },
      }),
    });
    
    const { data } = await response.json() as any;
    
    if (data.errors) {
      console.error('GraphQL Errors:', data.errors);
      vscode.window.showErrorMessage(`Code completion failed: ${data.errors.map((err: any) => err.message).join(', ')}`);
      return undefined;
    }
    
    return data?.createCodeCompletion;
  } catch (error) {
    debugger
    console.error('Error fetching code completion:', error);
    vscode.window.showErrorMessage(`Error fetching code completion: ${error}`);
    return undefined;
  }
}