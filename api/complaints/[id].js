import { db } from 'hatchable';
export const access='user'; export const methods=['GET'];
export default async function(req,res){const {rows}=await db.query('SELECT * FROM complaints WHERE id=$1 AND reporter_id=$2',[req.params.id,req.user.id]);if(!rows.length)return res.status(404).json({error:'Complaint not found'});const u=await db.query('SELECT status,note,created_at FROM complaint_updates WHERE complaint_id=$1 ORDER BY created_at',[req.params.id]);res.json({complaint:rows[0],updates:u.rows})}
