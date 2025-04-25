import React from 'react';
export { QuoteContextProvider } from './quoteContextProvider';

export const QuoteContext = React.createContext();
export const useQuoteContext = () => React.useContext(QuoteContext);
