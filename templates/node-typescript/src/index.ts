import {fileURLToPath} from "url";
import path from "path";
import chalk from "chalk";
import {getLlama, LlamaChatSession} from "node-llama-cpp";

import express from 'express';

// Initialize an Express application
const app = express();


// Define a port number
const PORT = 8000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modelsFolderDirectory = path.join(__dirname, "..", "models");

const model_name= "llama-3-taiwan-8B-instruct-q5_k_m.gguf"
const llama = await getLlama();

console.log(chalk.yellow("Loading model...: "+ model_name ));
const model = await llama.loadModel({
    modelPath: path.join(modelsFolderDirectory, model_name)
});

console.log(chalk.yellow("Creating context..."));
const context = await model.createContext();

const session = new LlamaChatSession({
    contextSequence: context.getSequence()
});


app.use(express.json()); // Middleware to parse JSON bodies
// Define a simple route
app.post('/', async (req, res) => {

const requestData = req.body;
const requestContent = requestData.content; // Assuming the request has a 'content' field


const prompt = `
Please examine the details to check if the item is made in Taiwan. If so, respond with 'Originating from Taiwan' in both Traditional Chinese and English. If not, provide a suitable alternative response. :\n\n${JSON.stringify(
    JSON.stringify(requestContent),
  )}`;

console.log(chalk.yellow("User: ") + prompt);
process.stdout.write(chalk.yellow("AI: "));
const a1 = await session.prompt(prompt, {
    onTextChunk(chunk) {
        // stream the response to the console as it's being generated
        process.stdout.write(chunk);
    }
});
process.stdout.write("\n");

  res.send(a1);
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});







// const q2 = "how up to date of your model is?";
// console.log(chalk.yellow("User: ") + q2);

// const a2 = await session.prompt(q2);
// console.log(chalk.yellow("AI: ") + a2);
// console.log();


// const q3 = "What are the verbs in this sentence: 'The cat sat on the mat'";
// console.log(chalk.yellow("User: ") + q3);

// // force the model to respond in accordance to the specified JSON schema format, so we can parse it and use it programmatically
// const responseGrammar = await llama.createGrammarForJsonSchema({
//     type: "object",
//     properties: {
//         verbs: {
//             type: "array",
//             items: {
//                 type: "string"
//             }
//         }
//     }
// });
// const a3 = await session.prompt(q2, {grammar: responseGrammar});
// const parsedResponse = responseGrammar.parse(a3);
// console.log(chalk.yellow("AI:"), parsedResponse.verbs);
// console.log();

// if (parsedResponse.verbs.length > 0) {
//     const q4 = `Define the verb "${parsedResponse.verbs[0]}"`;
//     console.log(chalk.yellow("User: ") + q4);

//     const a4 = await session.prompt(q4);
//     console.log(chalk.yellow("AI: ") + a4);
//     console.log();
// } else {
//     const q4 = "Are you sure there are no verbs in the sentence?";
//     console.log(chalk.yellow("User: ") + q4);

//     const a4 = await session.prompt(q4);
//     console.log(chalk.yellow("AI: ") + a4);
//     console.log();
// }
