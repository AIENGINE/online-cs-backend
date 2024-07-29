/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.toml`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

// TODO: Parse threadid to continue conversation thread

import { OpenAI } from 'openai/index.mjs';
import { ChatCompletionMessageParam } from 'openai/resources/index.mjs';

interface LangbaseResponse {
	completion: string;
}

export interface Env {
	OPENAI_API_KEY: string;
	LANGBASE_TRAVEL_PIPE_API_KEY: string,
	LANGBASE_ELECTRONICS_PIPE_API_KEY: string,
	LANGBASE_SPORTS_PIPE_API_KEY: string
}

export default {
	async fetch(request: Request, env:
		{ OPENAI_API_KEY: string, LANGBASE_SPORTS_PIPE_API_KEY: string, LANGBASE_ELECTRONICS_PIPE_API_KEY: string, LANGBASE_TRAVEL_PIPE_API_KEY: string },
		ctx: ExecutionContext): Promise<Response> {

		if (request.method === 'OPTIONS') {
			return new Response(null, {
				headers: {
					'Access-Control-Allow-Origin': 'http://localhost:3000',
					'Access-Control-Allow-Methods': 'POST, OPTIONS',
					'Access-Control-Allow-Headers': 'Content-Type',
				},
			});
		}

		if (request.method !== 'POST') {
			return new Response('Method Not Allowed', { status: 405 });
		}


		if (!env.OPENAI_API_KEY) {
			return new Response('OPENAI_API_KEY is not set', { status: 500 });
		}

		const openai = new OpenAI({
			apiKey: env.OPENAI_API_KEY,
		});

		let incomingMessages;
		try {
			const body = await request.json() as { messages: any[] };
			console.log('Parsed request body:', body);

			if (!body.messages || !Array.isArray(body.messages)) {
				console.log('Invalid messages structure');
				throw new Error('Invalid messages structure');
			}

			incomingMessages = body.messages;
			console.log('Extracted messages:', incomingMessages);

			if (incomingMessages.length === 0) {
				console.log('Empty messages array');
				throw new Error('Empty messages array');
			}

			const query = incomingMessages[incomingMessages.length - 1].content;
			console.log('Extracted query:', query);

			// Proceed with the rest of the logic using the extracted query

		} catch (error) {
			console.error('Error processing request:', (error as Error).message);
			return new Response(JSON.stringify({ error: (error as Error).message }), {
				status: 400,
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': 'http://localhost:3000',
				},
			});
		}

		const query = incomingMessages[incomingMessages.length - 1].content;
		async function call_sports_dept(customerQuery: string): Promise<string> {
			try {
				const response = await fetch('https://api.langbase.com/beta/generate', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${env.LANGBASE_SPORTS_PIPE_API_KEY}`,
					},
					body: JSON.stringify({
						messages: [
							{
								role: 'user',
								content: customerQuery,
							},
						],
					}),
				});

				if (!response.ok) {
					throw new Error(`HTTP error! status: ${response.status}`);
				}

				const data = await response.json() as LangbaseResponse;
				console.log('API Response:', JSON.stringify(data, null, 2));

				if (data && data.completion) {
					try {
						const parsedCompletion = JSON.parse(data.completion);
						return `Ticket No.: ${parsedCompletion['Ticket No.']}, Classification: ${parsedCompletion['Classification']}`;
					} catch (parseError) {
						console.error('Error parsing completion JSON:', parseError);
						return data.completion; // Return the original completion string if parsing fails
					}
				}

				throw new Error('Unexpected response format');
			} catch (error) {
				console.error('Error in call_sports_dept:', error);
				return `Error processing request: ${(error as Error).message}, we are working on it please be patient`;
			}
		}

		async function call_electronics_dept(customerQuery: string): Promise<string> {
			try {
				const response = await fetch('https://api.langbase.com/beta/generate', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${env.LANGBASE_ELECTRONICS_PIPE_API_KEY}`
					},
					body: JSON.stringify({
						messages: [{
							role: 'user',
							content: customerQuery
						}]
					})
				});

				if (!response.ok) {
					throw new Error(`HTTP error! status: ${response.status}`);
				}

				const data = await response.json() as LangbaseResponse;
				console.log('API Response:', JSON.stringify(data, null, 2));

				if (data && data.completion) {
					try {
						const parsedCompletion = JSON.parse(data.completion);
						return `Ticket No.: ${parsedCompletion['Ticket No.']}, Classification: ${parsedCompletion['Classification']}`;
					} catch (parseError) {
						console.error('Error parsing completion JSON:', parseError);
						return data.completion; // Return the original completion string if parsing fails
					}
				}

				throw new Error('Unexpected response format');
			} catch (error) {
				console.error('Error in call_electronics_dept:', error);
				return `Error processing request: ${error.message}, we are working on it please be patient`;
			}
		}


		async function call_travel_dept(customerQuery: string): Promise<string> {
			try {

				const response = await fetch('https://api.langbase.com/beta/generate', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${env.LANGBASE_TRAVEL_PIPE_API_KEY}`
					},
					body: JSON.stringify({
						messages: [{
							role: 'user',
							content: customerQuery
						}]
					})
				});

				if (!response.ok) {
					throw new Error(`HTTP error! status: ${response.status}`);
				}

				const data = await response.json();
				console.log('API Response:', JSON.stringify(data, null, 2));

				if (data && data.completion) {
					try {
						const parsedCompletion = JSON.parse(data.completion);
						return `Ticket No.: ${parsedCompletion['Ticket No.']}, Classification: ${parsedCompletion['Classification']}`;
					} catch (parseError) {
						console.error('Error parsing completion JSON:', parseError);
						return data.completion; // Return the original completion string if parsing fails
					}
				}

				throw new Error('Unexpected response format');
			} catch (error) {
				console.error('Error in call_travel_dept:', error);
				return `Error processing request: ${error.message}, we are working on it please be patient`;
			}
		}


		// const url = new URL(request.url);
		// const customerQuery = url.searchParams.get('query');
		// if (!customerQuery) {
		// 	return new Response('No query provided', { status: 400 });
		// }

		const messages: ChatCompletionMessageParam[] = [
			{ role: 'system', content: 'You are a customer support assistant for TechBay, an online store that sells sports gear (including sports clothes), electronics and appliances, and travel bags and suitcases. Classify the customer query into one of these three categories and call the appropriate function.' },
			{ role: 'user', content: query }
		];

		const tools: any = [
			{
				type: 'function',
				function: {
					name: 'call_sports_dept',
					description: 'Call this function for queries related to sports gear and clothes',
					parameters: {
						type: 'object',
						properties: {
							customerQuery: {
								type: 'string',
								description: 'The customer query related to sports gear',
							},
						},
						required: ['customerQuery'],
					},
				},
			},
			{
				type: 'function',
				function: {
					name: 'call_electronics_dept',
					description: 'Call this function for queries related to electronics and appliances',
					parameters: {
						type: 'object',
						properties: {
							customerQuery: {
								type: 'string',
								description: 'The customer query related to electronics and appliances',
							},
						},
						required: ['customerQuery'],
					},
				},
			},
			{
				type: 'function',
				function: {
					name: 'call_travel_dept',
					description: 'Call this function for queries related to travel bags and suitcases',
					parameters: {
						type: 'object',
						properties: {
							customerQuery: {
								type: 'string',
								description: 'The customer query related to travel bags and suitcases',
							},
						},
						required: ['customerQuery'],
					},
				},
			},
		];

		const chatCompletion = await openai.chat.completions.create({
			model: 'gpt-3.5-turbo',
			messages: messages,
			tools: tools,
			tool_choice: 'auto',
		});

		const assistantMessage = chatCompletion.choices[0].message;
		let responseContent = '';

		if (assistantMessage.tool_calls) {
			for (const toolCall of assistantMessage.tool_calls) {
				const functionName = toolCall.function.name;
				const functionArgs = JSON.parse(toolCall.function.arguments);

				switch (functionName) {
					case 'call_sports_dept':
						responseContent = await call_sports_dept(functionArgs.customerQuery);
						break;
					case 'call_electronics_dept':
						responseContent = await call_electronics_dept(functionArgs.customerQuery);
						break;
					case 'call_travel_dept':
						responseContent = await call_travel_dept(functionArgs.customerQuery);
						break;
				}
			}
		} else {
			responseContent = assistantMessage.content || 'Sorry, I couldn\'t process your request.';
		}


		return new Response(JSON.stringify({ content: responseContent }), {
			headers: {
				'Content-Type': 'application/json',
				'Access-Control-Allow-Origin': 'http://localhost:3000',
				'Access-Control-Allow-Methods': 'POST, OPTIONS',
				'Access-Control-Allow-Headers': 'Content-Type',
			},
		});

	},
};
