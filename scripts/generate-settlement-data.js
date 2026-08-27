import { generateSettlementData } from "../src/modules/reconciliation/reconciliation.service.js";
import connectDB from "../src/db/db.js";

await connectDB();
const summary = await generateSettlementData(process.argv[2]);
console.log(JSON.stringify(summary, null, 2));
process.exit(0);
