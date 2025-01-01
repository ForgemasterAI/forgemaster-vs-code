import {
    InlineCompletionItemProvider,
    InlineCompletionContext,
    InlineCompletionTriggerKind,
    InlineCompletionItem,
    TextDocument,
    Position,
    CancellationToken,
    SnippetString,
    Range,
    window,
    SecretStorage,
    InlineCompletionList,
    DocumentSymbol,
    commands,
  } from "vscode";

import { debounce, fetchCodeCompletion } from './utils/api';
import { EventEmitter } from "events";
import { CompletionFormatter } from "./utils/completion-formatter";

const debouncedFetch = debounce(fetchCodeCompletion, 300); // Debounce for 300ms

export class InlineCompletionProvider extends EventEmitter implements InlineCompletionItemProvider  {
    constructor(private secrets: SecretStorage) {
        super();
        this.secrets = secrets;
        console.debug('ForgemasterInlineCompletionItemProvider initialized');
    }

    
    private provideInlineCompletion(completion = '', startPosition: any, endPosition: any): InlineCompletionItem[] {
        const editor = window.activeTextEditor;
        if (!editor) {
            return [];
        }

        const formattedCompletion = new CompletionFormatter(editor).format(completion);
       
        return [
            new InlineCompletionItem(formattedCompletion, new Range(startPosition, endPosition))

        ];
    }
    async provideInlineCompletionItems(
        document: TextDocument,
        position: Position,
        _context: InlineCompletionContext,
        _token: CancellationToken
    ): Promise<InlineCompletionList | undefined> {
        const apiKey = await this.secrets.get('forgemasterAPIKey');
        console.debug('API Key:', apiKey);
    
        let result: InlineCompletionList = {
            items: []
        };
        if (!apiKey) {
            return result;
        }
        const line = document.lineAt(position.line);
        const textBeforeCursor = line.text.substring(0, position.character);

        // Improved matching: Trigger only after a word-like character is typed OR if it's a comment OR inside a block
        const commentPrefixes = ['//', '#', '--', ';', '%', '\''];
        const triggerRegex = /[\w$]/; // Enhanced regex to include word characters and $
        
        // Check if the current line starts with a comment
        const isCommentLine = commentPrefixes.some(prefix => textBeforeCursor.trimStart().startsWith(prefix));
        
        // Check if inside a block
        const isInsideBlock = textBeforeCursor.includes('{') && !textBeforeCursor.includes('}');
        
        // Detect if the text before the cursor ends with a new line
        const endsWithNewLine = textBeforeCursor.endsWith('\n');
        
        // Improved matching: Trigger only after a word-like character is typed, if it's a comment, inside a block, or after a new line
        if (
            !textBeforeCursor.length ||
            (
                !triggerRegex.test(textBeforeCursor.slice(-1)) &&
                !isCommentLine &&
                !isInsideBlock &&
                !endsWithNewLine
            )
        ) {
            console.debug('returning undefined because of trigger conditions');
            result.items = [];
        }
        // Extract the word to complete (more robust)
        const wordMatch = textBeforeCursor.match(/(\b[\w$]*)$/); // Allow matching from the beginning of a word
        const codeToComplete = wordMatch ? wordMatch[1] : '';

        if (!isCommentLine && !isInsideBlock && codeToComplete.length < 2) { // Require at least 2 characters to trigger for non-comments and outside blocks
            console.debug('returning undefined because of codeToComplete length');
            result.items = [];
        }

        // Extract code context
        const linesBefore: string[] = [];
        for (let i = Math.max(0, position.line - 25); i < position.line; i++) {
            linesBefore.push(document.lineAt(i).text);
        }
        const linesAfter: string[] = [];
        for (let i = position.line + 1; i < Math.min(document.lineCount, position.line + 25); i++) {
            linesAfter.push(document.lineAt(i).text);
        }
        const selection = window.activeTextEditor?.selection.isEmpty ? undefined : window.activeTextEditor?.selection;
        const imports = document.getText(new Range(0, 0, position.line, 0));
        const editor = window.activeTextEditor;
        let symbols: DocumentSymbol[] | undefined;
    
        if(editor) {
                symbols = await commands.executeCommand('vscode.executeWorkspaceSymbolProvider', '');
                symbols = symbols?.filter(symbol => {
                    //@ts-ignore
                    const range = symbol?.location?.range ?? symbol?.range; // Use location if available
                    return range.start?.line <= position.line && range.end.line >= position.line;
                });
            
        }

        console.debug(`imports: ${imports}`);
        const codeContext = {
            languageId: document.languageId,
            textBeforeCursor,
            currentLine: line.text,
            imports,
            linesAfter,
            ...(symbols ? { symbols } : {}),
            ...(selection ? { selectedText: document.getText(selection) } : {})
        };

        const completion = await debouncedFetch(codeContext, apiKey);

        if (completion) {
     
          const items  =  await this.provideInlineCompletion(completion, position, new Position(position.line, position.character + 1));
          result.items = items;
            
        } else {
            console.log('returning undefined');
        }

        return result;
    }
}