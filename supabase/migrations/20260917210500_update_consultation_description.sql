-- The public consultation page assigns the default host automatically, so its
-- introductory copy should direct prospects to the first visible choice.
update public.appointment_booking_pages
set
  description = 'Choose a date and time that works for you.',
  updated_at = now()
where slug = 'lv-branding-consultation'
  and description = 'Choose a team member and a time that works for you.';

alter table public.appointment_booking_pages
  alter column description set default 'Choose a date and time that works for you.';
