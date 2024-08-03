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


import { Pipe } from 'langbase';
interface LangbaseResponse {
	completion: string;
}

interface ToolCall {
	id: string;
	type: string;
	function: {
		name: string;
		arguments: string;
	};
}

interface AssistantMessage {
	role: string;
	content: string | null;
	tool_calls?: ToolCall[];
}

interface Choice {
	index: number;
	message: AssistantMessage;
	logprobs: null;
	finish_reason: string;
}

interface Usage {
	prompt_tokens: number;
	completion_tokens: number;
	total_tokens: number;
}

interface RawResponse {
	id: string;
	object: string;
	created: number;
	model: string;
	choices: Choice[];
	usage: Usage;
	system_fingerprint: null;
}

interface ApiResponse {
	success: boolean;
	completion: null;
	raw: RawResponse;
}


export interface Env {
	OPENAI_API_KEY: string;
	LANGBASE_TRAVEL_PIPE_API_KEY: string,
	LANGBASE_ELECTRONICS_PIPE_API_KEY: string,
	LANGBASE_SPORTS_PIPE_API_KEY: string,
	LANGBASE_ONLINE_STORE_CUSTOMER_SERVICE_API_KEY: string
}

async function callDepartment(deptKey: keyof Pick<Env, 'LANGBASE_SPORTS_PIPE_API_KEY' | 'LANGBASE_ELECTRONICS_PIPE_API_KEY' | 'LANGBASE_TRAVEL_PIPE_API_KEY'>, customerQuery: string, env: Env, threadId?: string): Promise<ReadableStream> {
	console.log(`Calling ${deptKey} department with query:`, customerQuery);

	const response = await fetch('https://api.langbase.com/beta/chat', {
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
	console.log('Thread ID for call dept:', threadId);

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

		let incomingMessages;
		let threadId = request.headers.get('lb-thread-id') || undefined;
		try {
			const body = await request.json() as { messages: any[], threadId?: string };
			console.log('Parsed request body:', body);

			incomingMessages = body.messages;
			threadId = body.threadId || threadId; // client set threadid in body, which returns the lb-thread-id in header 

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

		const userQuery = {
			threadId,
			messages: [{ role: 'user', content: query }],
		};
		const mainCustomerServicePipeResp = await fetch('https://api.langbase.com/beta/chat', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${env['LANGBASE_ONLINE_STORE_CUSTOMER_SERVICE_API_KEY']}`,
			},
			body: JSON.stringify(userQuery),
		});

		let assistantMessage: AssistantMessage = { 
			role: 'assistant',
			content: null,
			tool_calls: []
	  	};
		const mainCustomerServicePipeData= await mainCustomerServicePipeResp.json() as ApiResponse;
		const rawData = mainCustomerServicePipeData.raw;
		// console.log('main Pipe response:', rawData);

		if (rawData && rawData.choices && rawData.choices.length > 0) {
			assistantMessage  = rawData.choices[0].message;
			// console.log('Assistant message:', JSON.stringify(assistantMessage, null, 2));

			if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
				const toolCall = assistantMessage.tool_calls[0];
				console.log('Tool call:', toolCall.function.name);
				console.log('Arguments:', toolCall.function.arguments);
			}
		}

		threadId = mainCustomerServicePipeResp.headers.get('lb-thread-id') || threadId;
		console.log('ThreadId:', threadId);
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
				'Access-Control-Allow-Headers': 'Content-Type, lb-thread-id',
				'lb-thread-id': threadId || '',
			},
		});

	},
};
