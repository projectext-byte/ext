import { Database } from "./function/Database.js"
const ranks = new Database('rankDB')
const lobby = new Database('lobbyDB')
export { lobby, ranks }
