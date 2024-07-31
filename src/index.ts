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
import { OpenAIStream } from 'ai';

interface LangbaseResponse {
	completion: string;
}

export interface Env {
	OPENAI_API_KEY: string;
	LANGBASE_TRAVEL_PIPE_API_KEY: string,
	LANGBASE_ELECTRONICS_PIPE_API_KEY: string,
	LANGBASE_SPORTS_PIPE_API_KEY: string
}

function parseSSE(data: string): string {
	const lines = data.split('\n');
	let result = '';
	for (const line of lines) {
		if (line.startsWith('data: ')) {
			const jsonStr = line.slice(6);
			if (jsonStr === '[DONE]') break;
			try {
				const jsonObj = JSON.parse(jsonStr);
				if (jsonObj.choices && jsonObj.choices[0].delta.content) {
					result += jsonObj.choices[0].delta.content;
				}
			} catch (e) {
				console.error('Error parsing JSON:', e);
			}
		}
	}
	return result;
}

async function callDepartment(deptKey: keyof Pick<Env, 'LANGBASE_SPORTS_PIPE_API_KEY' | 'LANGBASE_ELECTRONICS_PIPE_API_KEY' | 'LANGBASE_TRAVEL_PIPE_API_KEY'>, customerQuery: string, env: Env, threadId?: string): Promise<ReadableStream> {
	console.log(`Calling ${deptKey} department with query:`, customerQuery);

	const response = await fetch('https://api.langbase.com/beta/generate', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${env[deptKey]}`,
		},
		body: JSON.stringify({
			messages: [{ role: 'user', content: customerQuery }],
			...(threadId && { threadId })
		}),
	});

	if (!response.ok) {
		return new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode(`Error: ${response.status} ${response.statusText}`));
				controller.close();
			}
		});
	}

	const reader = response.body!.getReader();
	const decoder = new TextDecoder();
	const encoder = new TextEncoder();

	return new ReadableStream({
		async start(controller) {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				const chunk = decoder.decode(value, { stream: true });
				controller.enqueue(encoder.encode(chunk));
			}
			controller.close();
		}
	});
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {

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
		let threadId;
		try {
			const body = await request.json() as { messages: any[], threadId?: string };
			console.log('Parsed request body:', body);

			incomingMessages = body.messages;
			threadId = body.threadId;

			console.log('Extracted messages:', incomingMessages);
			console.log('Thread ID:', threadId);

			if (!incomingMessages || !Array.isArray(incomingMessages) || incomingMessages.length === 0) {
				throw new Error('Invalid or empty messages array');
			}
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
		console.log('Extracted query:', query);


		const messages: ChatCompletionMessageParam[] = [
			{ role: 'system', content: 'You are a customer support assistant for TechBay, an online store that sells sports gear (including sports clothes), electronics and appliances, and travel bags and suitcases. Greet the customer and tell them if the need assistance with their purchae. As this is demo application simulate customer support assistant for TechBay as described earlier. If customer desribes their problem then Classify the customer query into one of these three categories and call the appropriate function. The customer is issued a ticket no. and classification from the toolcall after the classification, politely tell them to be patient as respresentative of a department which is the tool call name will contant them soon' },
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
			model: 'gpt-4-turbo',
			messages: messages,
			tools: tools,
			tool_choice: 'auto',
		});

		const assistantMessage = chatCompletion.choices[0].message;
		console.log('OpenAI response:', assistantMessage.content);

		let responseStream: ReadableStream = new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode('No response generated.'));
				controller.close();
			}
		});

		if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
			for (const toolCall of assistantMessage.tool_calls) {
				const functionName = toolCall.function.name;
				const functionArgs = JSON.parse(toolCall.function.arguments);

				switch (functionName) {
					case 'call_sports_dept':
						responseStream = await callDepartment('LANGBASE_SPORTS_PIPE_API_KEY', functionArgs.customerQuery, env, threadId);
						break;
					case 'call_electronics_dept':
						responseStream = await callDepartment('LANGBASE_ELECTRONICS_PIPE_API_KEY', functionArgs.customerQuery, env, threadId);
						break;
					case 'call_travel_dept':
						responseStream = await callDepartment('LANGBASE_TRAVEL_PIPE_API_KEY', functionArgs.customerQuery, env, threadId);
						break;
				}
			}
		} else {
			responseStream = new ReadableStream({
				async start(controller) {
				  const encoder = new TextEncoder();
				  const content = assistantMessage.content || 'Sorry, I couldn\'t process your request.';
				  controller.enqueue(encoder.encode('data: ' + JSON.stringify({ choices: [{ delta: { content } }] }) + '\n\n'));
				  controller.close();
				}
			  });
			}
			

		return new Response(responseStream, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				'Connection': 'keep-alive',
				'Access-Control-Allow-Origin': 'http://localhost:3000',
				'Access-Control-Allow-Methods': 'POST, OPTIONS',
				'Access-Control-Allow-Headers': 'Content-Type',
			  },
		});

	},
};
