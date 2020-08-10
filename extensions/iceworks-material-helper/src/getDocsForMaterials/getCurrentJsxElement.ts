import { JSXOpeningElement } from '@babel/types';
import origingetCurrentJsxElement from '../utils/getCurrentJsxElement';

// <T|ext  >...</Text>
function conditionOfHover(cursorPosition: number, jsxOpeningElement: JSXOpeningElement): boolean {
  return !!(
    jsxOpeningElement.name.start &&
    cursorPosition > jsxOpeningElement.name.start &&
    jsxOpeningElement.name.end &&
    cursorPosition < jsxOpeningElement.name.end
  );
}

type CurrentJsxElement = JSXOpeningElement | null;
export default function getCurrentJsxElement(documentText: string, cursorPosition): CurrentJsxElement {
  return origingetCurrentJsxElement(documentText, cursorPosition, conditionOfHover);
}
