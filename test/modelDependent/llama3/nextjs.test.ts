import {describe, test} from "vitest";
import {LlamaChatSession} from "../../../src/index.js";
import {getModelFile} from "../../utils/modelFiles.js";
import {getTestLlama} from "../../utils/getTestLlama.js";

describe("llama 3", () => {
    describe("functions and grammar", () => {
        test("get n-th word", {timeout: 1000 * 60 * 60 * 2}, async () => {
           const prompt = "Please review the details to determine if there is any indication that the item is manufactured in Taiwan. If it is, please respond with 'Originating from Taiwan'; otherwise, provide an alternative response.'claim' :'{\"model\":\"Tesla Model Y\",\"variants\":[{\"name\":\"Long Range\",\"battery\":{\"capacity_kWh\":75,\"chemistry\":\"NCA (Nickel Cobalt Aluminum Oxide)\",\"voltage_V\":350,\"modules\":4,\"cells_per_module\":384,\"total_cells\":1536},\"range_miles\":330,\"power_hp\":384,\"torque_lb_ft\":376,\"0_to_60_mph_seconds\":4.8,\"top_speed_mph\":135,\"charging\":{\"max_supercharging_speed_kW\":250,\"home_charging_speed_kW\":11.5,\"charging_time_110V_hours\":40,\"charging_time_220V_hours\":11,\"charging_time_supercharger_80_percent_minutes\":25},\"weight_lbs\":4416},{\"name\":\"Performance\",\"battery\":{\"capacity_kWh\":75,\"chemistry\":\"NCA (Nickel Cobalt Aluminum Oxide)\",\"voltage_V\":350,\"modules\":4,\"cells_per_module\":384,\"total_cells\":1536},\"range_miles\":303,\"power_hp\":456,\"torque_lb_ft\":497,\"0_to_60_mph_seconds\":3.5,\"top_speed_mph\":155,\"charging\":{\"max_supercharging_speed_kW\":250,\"home_charging_speed_kW\":11.5,\"charging_time_110V_hours\":40,\"charging_time_220V_hours\":11,\"charging_time_supercharger_80_percent_minutes\":25},\"weight_lbs\":4553}]}";

            const modelPath = await getModelFile("Meta-Llama-3-8B-Instruct-Q4_K_M.gguf");
            const loraPath = await getModelFile("lora-Llama-3-Instruct-abliteration-LoRA-8B-f16.gguf");
            const llama = await getTestLlama();

            const model = await llama.loadModel({
                modelPath
            });

//            const contextWithoutLora = await model.createContext({
//                contextSize: 4096
//            });
//            const chatSessionWithoutLora = new LlamaChatSession({
//                contextSequence: contextWithoutLora.getSequence()
//            });
//            const resWithoutLora = await chatSessionWithoutLora.prompt(prompt);
//            console.log(resWithoutLora) 

//            await contextWithoutLora.dispose();


            const contextWithLora = await model.createContext({
                contextSize: 4096,
                lora: {
                    adapters: [{
                        filePath: loraPath
                    }]
                }
            });
            const chatSessionWithLora = new LlamaChatSession({
                contextSequence: contextWithLora.getSequence()
            });
            const resWithLora = await chatSessionWithLora.prompt(prompt);
  
            console.log(resWithLora);

        });
    });
});
