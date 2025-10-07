import readline from 'node:readline/promises';

import Groq from 'groq-sdk';

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const expenseDB = [];
const incomeDB = [];

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const messages = [
    {
        role: 'system',
        content: `You are a personal finance assistant. Your task is to assist user with their expenses, balances and financial planning.
        You have access to following tools:
        1. getTotalExpense({from, to}): string // Get total expense for a time period.
        2. addExpense({name, amount}): string // Add new expense to the expense database.
        3. addIncome({name, amount}): string // Add new income to income database.
        3. getMoneyBalance(): string // Get remaining money balance from database.

        current datetime: ${new Date().toUTCString()}`,
    },
];

const tools = [
    {
        type: 'function',
        function: {
            name: 'getTotalExpense',
            description: 'Get total expense from date to date.',
            parameters: {
                type: 'object',
                properties: {
                    from: {
                        type: 'string',
                        description: 'From date to get the expense.',
                    },
                    to: {
                        type: 'string',
                        description: 'To date to get the expense.',
                    },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'addExpense',
            description: 'Add new expense entry to the expense database.',
            parameters: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: 'Name of the expense. e.g., Bought an iphone',
                    },
                    amount: {
                        type: 'string',
                        description: 'Amount of the expense.',
                    },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'addIncome',
            description: 'Add new income entry to income database',
            parameters: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: 'Name of the income. e.g., Got salary',
                    },
                    amount: {
                        type: 'string',
                        description: 'Amount of the income.',
                    },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'getMoneyBalance',
            description: 'Get remaining money balance from database.',
        },
    },
];

async function processUserMessage(userMessage) {
    messages.push({
        role: 'user',
        content: userMessage,
    });

    while (true) {
        const completion = await groq.chat.completions.create({
            messages: messages,
            model: 'llama-3.3-70b-versatile',
            tools: tools,
        });

        messages.push(completion.choices[0].message);

        const toolCalls = completion.choices[0].message.tool_calls;
        if (!toolCalls) {
            return completion.choices[0].message.content;
        }

        for (const tool of toolCalls) {
            const functionName = tool.function.name;
            const functionArgs = JSON.parse(tool.function.arguments);

            let result = '';
            if (functionName === 'getTotalExpense') {
                result = getTotalExpense(functionArgs);
            } else if (functionName === 'addExpense') {
                result = addExpense(functionArgs);
            } else if (functionName === 'addIncome') {
                result = addIncome(functionArgs);
            } else if (functionName === 'getMoneyBalance') {
                result = getMoneyBalance(functionArgs);
            }

            messages.push({
                role: 'tool',
                content: result,
                tool_call_id: tool.id,
            });
        }
    }
}

async function callAgent() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    // this is for user prompt loop
    while (true) {
        const question = await rl.question('User: ');

        if (question === 'bye') {
            break;
        }

        const response = await processUserMessage(question);
        console.log(`Assistant: ${response}`);
    }

    rl.close();
}

// Web server setup
const app = express();
const server = createServer(app);
const io = new Server(server);

app.use(express.static('public'));

io.on('connection', (socket) => {
    socket.on('userMessage', async (msg) => {
        const response = await processUserMessage(msg);
        socket.emit('assistantMessage', response);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});


function getTotalExpense({ from, to }) {
    // console.log('Calling getTotalExpense tool');

    const expense = expenseDB.reduce((acc, item) => {
        return acc + item.amount;
    }, 0);
    return `${expense} INR`;
}

function addExpense({ name, amount }) {
    // console.log(`Adding ${amount} to expense db for ${name}`);
    expenseDB.push({ name, amount });
    return 'Added to the database.';
}

function addIncome({ name, amount }) {
    incomeDB.push({ name, amount });
    return 'Added to the income database.';
}

function getMoneyBalance() {
    const totalIncome = incomeDB.reduce((acc, item) => acc + item.amount, 0);
    const totalExpense = expenseDB.reduce((acc, item) => acc + item.amount, 0);

    return `${totalIncome - totalExpense} INR`;
}