import React from 'react'
import { createRoot } from 'react-dom/client'

function App(){
  return <div style={{padding:20}}>MRS Frontend (skeleton)</div>
}

createRoot(document.getElementById('root')!).render(<App />)
