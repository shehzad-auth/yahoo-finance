// app/page.tsx
"use client";
import { useState } from 'react';

interface ProgressState {
  current: number;
  total: number;
  error?: string;
}

export default function Home() {
  const [symbols, setSymbols] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [interval, setInterval] = useState('1d');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<ProgressState>({ current: 0, total: 0 });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const symbolList = symbols
      .split(',')
      .map(s => s.trim().toUpperCase())
      .filter(s => s !== '');

    if (symbolList.length === 0) {
      setError('Please enter at least one symbol');
      setLoading(false);
      return;
    }

    setProgress({ current: 0, total: symbolList.length });

    try {
      const response = await fetch('/api/stock-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbols: symbolList,
          startDate,
          endDate,
          interval
        }),
      });

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const [eventLine, dataLine] = line.split('\n');
          if (!eventLine || !dataLine) continue;

          const event = eventLine.replace('event: ', '');
          const data = JSON.parse(dataLine.replace('data: ', ''));

          switch (event) {
            case 'progress':
              setProgress({
                current: data.current,
                total: data.total,
                error: data.error
              });
              break;

            case 'complete':
              // Create and download CSV file
              const blob = new Blob([data], { type: 'text/csv' });
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `stock_historical_data.csv`;
              document.body.appendChild(a);
              a.click();
              window.URL.revokeObjectURL(url);
              a.remove();
              break;

            case 'error':
              throw new Error(data.error);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const progressPercentage = progress.total > 0 
    ? Math.round((progress.current / progress.total) * 100) 
    : 0;

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <div className="text-center">
          <h1 className="text-3xl font-extrabold text-gray-900">
            Historical Data using yahoo finance
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Enter comma-separated stock symbols (e.g., AAPL, MSFT, GOOG)
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div className="rounded-md shadow-sm space-y-4">
            <div>
              <label htmlFor="symbols" className="block text-sm font-medium text-gray-700">
                Stock Symbols
              </label>
              <input
                id="symbols"
                type="text"
                required
                value={symbols}
                onChange={(e) => setSymbols(e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                placeholder="AAPL, MSFT, GOOG"
              />
            </div>

            <div>
              <label htmlFor="interval" className="block text-sm font-medium text-gray-700">
                Interval
              </label>
              <select
                id="interval"
                value={interval}
                onChange={(e) => setInterval(e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
              >
                <option value="1d">Daily</option>
                <option value="1wk">Weekly</option>
                <option value="1mo">Monthly</option>
              </select>
            </div>

            <div>
              <label htmlFor="startDate" className="block text-sm font-medium text-gray-700">
                Start Date
              </label>
              <input
                id="startDate"
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
              />
            </div>

            <div>
              <label htmlFor="endDate" className="block text-sm font-medium text-gray-700">
                End Date
              </label>
              <input
                id="endDate"
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
              />
            </div>
          </div>

          {(error || progress.error) && (
            <div className="text-red-600 text-sm">
              {error || progress.error}
            </div>
          )}

          {loading && (
            <div className="space-y-2">
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div 
                  className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercentage}%` }}
                ></div>
              </div>
              <div className="text-sm text-gray-600 text-center">
                Processing {progress.current} of {progress.total} symbols ({progressPercentage}%)
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400"
          >
            {loading ? 'Processing...' : 'Download Data'}
          </button>
        </form>
      </div>
    </div>
  );
}