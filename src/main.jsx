import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { CluckWalletProvider } from './wallet-provider.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <CluckWalletProvider>
      <App />
    </CluckWalletProvider>
  </React.StrictMode>,
)
