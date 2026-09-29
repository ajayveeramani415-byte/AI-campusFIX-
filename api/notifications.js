import { db } from 'hatchable';
export const access='user'; export const methods=['GET'];
export default async function(req,res){const {rows}=await db.query('SELECT id,complaint_id,title,message,read_at,created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50',[req.user.id]);return res.json(rows)}
