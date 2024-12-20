// app/api/stock-data/route.ts
import { NextResponse } from 'next/server';
import yahooFinance from 'yahoo-finance2';
import { Parser } from 'json2csv';

interface StockDataRequest {
  symbols: string[];
  startDate: string;
  endDate: string;
  interval: '1d' | '1wk' | '1mo';
}

interface ProgressUpdate {
  type: 'progress';
  current: number;
  total: number;
  error?: string;
}

interface HistoricalDataItem {
    date: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    adjClose?: number | undefined;
  }

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function POST(req: Request) {
  try {
    const { symbols, startDate, endDate, interval }: StockDataRequest = await req.json();

    if (!symbols?.length || !startDate || !endDate) {
      return NextResponse.json(
        { message: 'Missing required fields' },
        { status: 400 }
      );
    }

    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    (async () => {
      try {
        const queryOptions = {
          period1: new Date(startDate),
          period2: new Date(endDate),
          interval: interval as '1d' | '1wk' | '1mo',
        };

        const allResults = [];
        let processedCount = 0;
        const failedSymbols: string[] = [];

        for (const symbol of symbols) {
          try {
            await delay(1000);

            // Validate symbol first
            const quote = await yahooFinance.quote(symbol);
            if (!quote) {
              throw new Error('Invalid symbol');
            }

            const result = await yahooFinance.historical(symbol, queryOptions);
            const resultWithSymbol = result.map((item: HistoricalDataItem) => ({
              ...item,
              symbol
            }));
            allResults.push(...resultWithSymbol);
          } catch (error) {
            console.error(`Error fetching data for symbol ${symbol}:`, error);
            failedSymbols.push(symbol);
          }

          processedCount++;
          const progressUpdate: ProgressUpdate = {
            type: 'progress',
            current: processedCount,
            total: symbols.length,
            error: failedSymbols.length > 0 
              ? `Failed to fetch: ${failedSymbols.join(', ')}`
              : undefined
          };
          
          await writer.write(
            encoder.encode(`event: progress\ndata: ${JSON.stringify(progressUpdate)}\n\n`)
          );
        }

        if (allResults.length === 0) {
          throw new Error('No valid data retrieved for any symbols');
        }

        const fields = ['symbol', 'date', 'open', 'high', 'low', 'close', 'volume', 'adjClose'];
        const parser = new Parser({ fields });
        const csv = parser.parse(allResults);

        await writer.write(encoder.encode(`event: complete\ndata: ${csv}\n\n`));
        await writer.close();
      } catch (error) {
        console.error('Error processing data:', error);
        const errorMessage = error instanceof Error ? error.message : 'An error occurred';
        await writer.write(
          encoder.encode(`event: error\ndata: ${JSON.stringify({ error: errorMessage })}\n\n`)
        );
        await writer.close();
      }
    })();

    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Error fetching stock data:', error);
    return NextResponse.json(
      { message: 'Failed to fetch stock data' },
      { status: 500 }
    );
  }
}