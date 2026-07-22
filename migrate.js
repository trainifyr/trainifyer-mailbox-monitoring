const pool = require('./backend/src/lib/pgPool');

async function run() {
  try {
    await pool.query(`
      ALTER TABLE public.mail_messages DROP CONSTRAINT IF EXISTS mail_messages_sender_id_fkey;
      ALTER TABLE public.mail_messages DROP CONSTRAINT IF EXISTS mail_messages_receiver_id_fkey;
      
      ALTER TABLE public.mail_messages ALTER COLUMN sender_id DROP NOT NULL;
      ALTER TABLE public.mail_messages ALTER COLUMN receiver_id DROP NOT NULL;

      ALTER TABLE public.mail_messages 
        ADD CONSTRAINT mail_messages_sender_id_fkey 
        FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE SET NULL;
        
      ALTER TABLE public.mail_messages 
        ADD CONSTRAINT mail_messages_receiver_id_fkey 
        FOREIGN KEY (receiver_id) REFERENCES public.users(id) ON DELETE SET NULL;
    `);
    console.log('Schema updated successfully.');
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

run();
