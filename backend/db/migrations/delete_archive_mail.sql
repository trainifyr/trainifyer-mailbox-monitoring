ALTER TABLE public.mail_messages ADD COLUMN deleted_by_sender boolean NOT NULL DEFAULT false;
ALTER TABLE public.mail_messages ADD COLUMN deleted_by_receiver boolean NOT NULL DEFAULT false;
