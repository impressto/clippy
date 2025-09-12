import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useParams, Link } from 'react-router-dom';

// TextShareApp Component
function TextShareApp() {
    const { id } = useParams();
    const [text, setText] = useState('');

    // Load text from server
    const loadText = async () => {
        const response = await fetch(`/share.php?id=${id}`);
        const data = await response.json();
        if (data.text) setText(data.text);
    };

    // Save text to server
    const saveText = async (newText) => {
        await fetch(`/share.php?id=${id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `text=${encodeURIComponent(newText)}`,
        });
    };

    // Poll for updates every 2 seconds
    useEffect(() => {
        loadText();
        const interval = setInterval(loadText, 2000);
        return () => clearInterval(interval);
    }, [id]);

    const handleTextChange = (e) => {
        const newText = e.target.value;
        setText(newText);
        saveText(newText);
    };

    return (
        <div>
            <h1>Clippy</h1>
            <textarea value={text} onChange={handleTextChange} />
            <p>Share this URL: {window.location.href}</p>
        </div>
    );
}

// Home Component
function Home() {
    const [uniqueId, setUniqueId] = useState('');

    // Generate a unique ID
    useEffect(() => {
        fetch('/share.php')
            .then(response => response.json())
            .then(data => setUniqueId(data.id));
    }, []);

    return (
        <div>
            <h1>Welcome to Text Clippy</h1>
            {uniqueId && <Link to={`/share/${uniqueId}`}>Start Sharing</Link>}
        </div>
    );
}

// Main App
function App() {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/share/:id" element={<TextShareApp />} />
            </Routes>
        </Router>
    );
}

export default App;
