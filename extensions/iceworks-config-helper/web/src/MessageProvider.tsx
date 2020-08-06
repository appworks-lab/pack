import React, { useEffect, useState, createContext } from 'react';

export const MessageContext = createContext({
  receivedMessage: {},
});

export const MessageProvider = (props) => {
  const [receivedMessage, setRecevicedMessage] = useState({});

  useEffect(() => {
    window.addEventListener(
      'message',
      (e) => {
        console.log('receivedMessage', JSON.stringify(e.data));
        setRecevicedMessage(e.data);
      },
      false
    );
  }, []);

  return (
    <MessageContext.Provider value={{ receivedMessage }}>{React.Children.only(props.children)}</MessageContext.Provider>
  );
};
