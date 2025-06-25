'use client';

import { useState, useEffect } from 'react';

export default function GmailAdminPage() {
  const [authUrl, setAuthUrl] = useState<string>('');
  const [replies, setReplies] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('');

  const getAuthUrl = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/gmail/auth');
      const data = await response.json();
      
      if (data.success) {
        setAuthUrl(data.authUrl);
        setStatus('Auth URL generated successfully');
      } else {
        setStatus('Failed to generate auth URL');
      }
    } catch (error) {
      console.error('Error getting auth URL:', error);
      setStatus('Error getting auth URL');
    } finally {
      setLoading(false);
    }
  };

  const checkReplies = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/gmail/replies');
      const data = await response.json();
      
      if (data.success) {
        setReplies(data.replies);
        setStatus(`Found ${data.count} replies`);
      } else {
        setStatus('Failed to check replies');
      }
    } catch (error) {
      console.error('Error checking replies:', error);
      setStatus('Error checking replies');
    } finally {
      setLoading(false);
    }
  };

  const runScheduledCheck = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/gmail/scheduled-check');
      const data = await response.json();
      
      if (data.success) {
        setStatus(`Scheduled check completed. Processed ${data.repliesProcessed} replies`);
      } else {
        setStatus('Failed to run scheduled check');
      }
    } catch (error) {
      console.error('Error running scheduled check:', error);
      setStatus('Error running scheduled check');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Gmail Admin Panel</h1>
        
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">OAuth Authentication</h2>
          <button
            onClick={getAuthUrl}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Generate Auth URL'}
          </button>
          
          {authUrl && (
            <div className="mt-4">
              <p className="text-sm text-gray-600 mb-2">Click the link below to authorize Gmail access:</p>
              <a
                href={authUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 underline break-all"
              >
                {authUrl}
              </a>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Reply Monitoring</h2>
          <div className="space-x-4">
            <button
              onClick={checkReplies}
              disabled={loading}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Check Replies'}
            </button>
            
            <button
              onClick={runScheduledCheck}
              disabled={loading}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Run Scheduled Check'}
            </button>
          </div>
        </div>

        {status && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Status</h2>
            <p className="text-gray-700">{status}</p>
          </div>
        )}

        {replies.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">Recent Replies ({replies.length})</h2>
            <div className="space-y-4">
              {replies.map((reply, index) => (
                <div key={index} className="border border-gray-200 rounded p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-medium text-gray-900">{reply.subject}</h3>
                    <span className="text-sm text-gray-500">{reply.from}</span>
                  </div>
                  <p className="text-gray-600 text-sm">{reply.snippet}</p>
                  <p className="text-xs text-gray-400 mt-2">
                    ID: {reply.id} | Date: {new Date(parseInt(reply.internalDate)).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 