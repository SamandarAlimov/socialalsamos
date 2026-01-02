import { useState, useCallback } from 'react';

interface AutocompleteState {
  type: 'mention' | 'hashtag' | null;
  isActive: boolean;
  query: string;
  startIndex: number;
}

export function useAutocompleteInput() {
  const [autocompleteState, setAutocompleteState] = useState<AutocompleteState>({
    type: null,
    isActive: false,
    query: '',
    startIndex: -1,
  });

  const detectAutocomplete = useCallback((value: string, cursorPosition: number) => {
    // Look backwards from cursor to find @ or # symbol
    let triggerIndex = -1;
    let triggerType: 'mention' | 'hashtag' | null = null;

    for (let i = cursorPosition - 1; i >= 0; i--) {
      const char = value[i];
      // Stop if we hit a space or newline before finding trigger
      if (char === ' ' || char === '\n') {
        break;
      }
      if (char === '@') {
        triggerIndex = i;
        triggerType = 'mention';
        break;
      }
      if (char === '#') {
        triggerIndex = i;
        triggerType = 'hashtag';
        break;
      }
    }

    if (triggerIndex !== -1 && triggerType) {
      const query = value.substring(triggerIndex + 1, cursorPosition);
      // Valid query (alphanumeric and underscore only)
      if (/^[a-zA-Z0-9_]*$/.test(query)) {
        setAutocompleteState({
          type: triggerType,
          isActive: true,
          query,
          startIndex: triggerIndex,
        });
        return;
      }
    }

    setAutocompleteState({
      type: null,
      isActive: false,
      query: '',
      startIndex: -1,
    });
  }, []);

  const handleInputChange = useCallback((
    value: string, 
    cursorPosition: number,
    onChange: (value: string) => void
  ) => {
    onChange(value);
    detectAutocomplete(value, cursorPosition);
  }, [detectAutocomplete]);

  const insertAutocomplete = useCallback((
    currentValue: string,
    insertValue: string,
    inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement>
  ): string => {
    const { startIndex, type } = autocompleteState;
    if (startIndex === -1 || !type) return currentValue;

    const beforeTrigger = currentValue.substring(0, startIndex);
    const cursorPos = inputRef.current?.selectionStart || currentValue.length;
    const afterTrigger = currentValue.substring(cursorPos);
    
    const prefix = type === 'mention' ? '@' : '#';
    const newValue = `${beforeTrigger}${prefix}${insertValue} ${afterTrigger}`;
    
    // Close autocomplete popup
    setAutocompleteState({
      type: null,
      isActive: false,
      query: '',
      startIndex: -1,
    });

    // Set cursor position after the inserted value
    setTimeout(() => {
      if (inputRef.current) {
        const newCursorPos = startIndex + insertValue.length + 2; // +2 for prefix and space
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
        inputRef.current.focus();
      }
    }, 0);

    return newValue;
  }, [autocompleteState]);

  const closeAutocomplete = useCallback(() => {
    setAutocompleteState({
      type: null,
      isActive: false,
      query: '',
      startIndex: -1,
    });
  }, []);

  return {
    autocompleteState,
    handleInputChange,
    insertAutocomplete,
    closeAutocomplete,
  };
}