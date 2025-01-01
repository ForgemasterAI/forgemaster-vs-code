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
  } from "vscode";

import { debounce, fetchCodeCompletion } from './utils/api';
import { EventEmitter } from "events";

const debouncedFetch = debounce(fetchCodeCompletion, 300); // Debounce for 300ms

export class InlineCompletionProvider extends EventEmitter implements InlineCompletionItemProvider  {
    constructor(private secrets: SecretStorage) {
        super();
        this.secrets = secrets;
        console.debug('ForgemasterInlineCompletionItemProvider initialized');
    }

    async provideInlineCompletionItems(
        document: TextDocument,
        position: Position,
        _context: InlineCompletionContext,
        _token: CancellationToken
    ): Promise<InlineCompletionList | undefined> {
        const apiKey = await this.secrets.get('forgemasterAPIKey');
        console.debug('API Key:', apiKey);
    
        const result: InlineCompletionList = {
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
            console.log('returning undefined because of trigger conditions');
            result.items = [];
        }
        // Extract the word to complete (more robust)
        const wordMatch = textBeforeCursor.match(/(\b[\w$]*)$/); // Allow matching from the beginning of a word
        const codeToComplete = wordMatch ? wordMatch[1] : '';

        if (!isCommentLine && !isInsideBlock && codeToComplete.length < 2) { // Require at least 2 characters to trigger for non-comments and outside blocks
            console.log('returning undefined because of codeToComplete length');
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

        const codeContext = {
            languageId: document.languageId,
            textBeforeCursor: textBeforeCursor,
            currentLine: line.text,
            linesBefore: linesBefore,
            linesAfter: linesAfter,
            ...(selection ? { selectedText: document.getText(selection) } : {})
        };

        const completion = await debouncedFetch(codeContext, codeToComplete, apiKey);

        if (completion) {
   
            let insertText = completion;
            let endChar = position.character + completion.length;
            let insertRange: Range = new Range(position, new Position(position.line, endChar));

            if (!isCommentLine) {
                // For non-comment lines, potentially replace the word being typed
                const wordMatchForRange = textBeforeCursor.match(/([\w$]*)$/);
                if (wordMatchForRange && wordMatchForRange[0].length > 0) {
                    const wordToReplace = wordMatchForRange[0];
                    const startChar = position.character - wordToReplace.length;
                    console.debug('textBeforeCursor:', textBeforeCursor);
                    console.debug('wordMatchForRange:', wordMatchForRange);
                    console.debug('wordToReplace:', wordToReplace);
                    console.debug('startChar:', startChar);
                    const startPosition = new Position(position.line, startChar);
                    insertRange = new Range(startPosition, position);
                }
            } else {
                // For comment lines, maintain the insertion at the current position
                const indentationMatch = line.text.match(/^\s*/);
                const indentation = indentationMatch ? indentationMatch[0] : '';
                insertText = indentation + completion;
            }

            result.items = [
                {
                    insertText: insertText,
                    range: insertRange
                }
            ];

        } else {
            console.log('returning undefined');
        }

        console.log('result', result.items.length > 0 ? result.items[0].insertText : 'No completion');

        return result;
    }
}