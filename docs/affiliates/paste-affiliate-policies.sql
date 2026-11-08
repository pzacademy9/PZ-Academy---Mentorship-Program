-- paste-affiliate-policies.sql
-- Puts the three affiliate policy documents on the live site (Terms, Rules, Privacy).
-- The owner pastes this in the Supabase SQL editor. Safe to run twice (it replaces the text each time).
-- Written by an AI assistant. NOT legal advice. A lawyer in Pakistan should read it.
-- Headings are lines like "1. Who can join" followed by a blank line (the site turns those into headings).

insert into public.site_terms (key, body, updated_at) values
('affiliate_terms', $terms$Affiliate Terms and Conditions
Last updated: 8 November 2026

These terms are an agreement between you and Pharmacozyme, which runs PZ Academy ("we", "us"). By ticking the box on the application form, or by using your affiliate code or link, you agree to them.

1. Who can join

You must be at least 18 years old and able to make a legal agreement. We choose who joins. We may accept or decline any application without giving a reason.

2. Your role

You are an independent affiliate. You are not our employee, agent, partner or representative. You cannot sign anything for us, make promises for us, or speak as PZ Academy. You choose how and when you promote, within these terms and the Affiliate Rules.

3. Your code and your private link

If we accept you, we give you a personal affiliate code and a private link. Keep your private link to yourself. Anyone who has it can see your numbers and request a payout.

Your code is yours to share with students. It gives students 10% off. A student may also type your code with a percent after it, such as CODE-15%, up to the highest percent we allow (currently 30%). A bigger discount lowers your commission, because commission is worked out on what the student actually pays.

We may change your code if it is misused. Old codes we already issued keep working until we say otherwise.

4. Commission

You earn commission of 8% to 10% of the amount a student actually pays for a registration that uses your code or your link, after any discount. The percent is either set by us for you, or follows the automatic rule: 8%, or 10% for a whole month if you had 10 or more paid participants in the month before. Fewer than 10 in a month means 8% the next month. Months are counted in Pakistan time. We tell you which applies to you.

A sale counts only when we have confirmed the payment as Paid. Registrations that are unpaid, free, cancelled, refunded or marked as a test earn nothing.

If a payment is refunded or reversed after commission was counted, we take that commission back. If you have already been paid for it, we may deduct it from your next payout.

A sale counts for you if the student uses your code, or registers through your private link within 30 days of opening it. If a student does both, the private link comes first.

You may not earn commission on your own registration. Relatives and friends who register for themselves can earn you commission like anyone else, as long as they really are the ones registering and paying. Registering people under false details to earn commission is not allowed.

Some courses are priced in another currency, such as AED or SAR. Commission on those sales is worked out on the amount we actually receive in Pakistani rupees. If we have not yet received or recorded that amount, we convert it by hand when we confirm it. We decide the final figures from our records.

If you think a figure is wrong, write to us within 30 days and we will check it.

We may change commission percents or rules for future sales. We will tell you before the change starts. Sales already counted are not changed.

5. Payouts

You can ask for a payout when your balance is PKR 3,500 or more.

When you ask, you tell us where to send the money (JazzCash, Easypaisa or a bank account). You must give accurate details. We are not responsible for money sent to details you gave us.

We aim to pay within 7 working days of a request. We pay by hand and mark the request as paid.

You are responsible for any tax that applies to your earnings. We may ask for identity details before paying.

If we cannot reach you or the payment details do not work, we may hold the payout until you fix it.

6. Rules you must follow

You must follow the Affiliate Rules. Breaking them can lead to losing commission and being removed.

7. Promotion materials and our name

You may use our name and approved material to promote our courses honestly. You may not change our logo, copy our website, or run paid advertising that uses our name or logo unless we agree in writing first.

8. Ending

You can stop any time by telling us.

We can drop you at any time, and without notice if you break the rules, cheat, or harm our name.

When you stop or are dropped, you keep commission already earned and confirmed, except where it came from rule breaking, fake registrations, or refunds. We may close an account that has had no activity for 6 months. Any earned balance stays payable.

9. No promises

We do not promise any amount of income, any number of students, or that the programme will continue. Courses, prices, discounts and dates can change. We may change or end the programme.

10. Our responsibility

We provide the programme as it is. To the extent the law allows, we are not responsible for lost earnings or other indirect losses. Nothing here limits responsibility that the law does not allow us to limit.

11. Changes to these terms

We may update these terms. We will show the new version on the affiliate pages. If you keep using your code or link after a change, you accept the new version. For big changes we will email you.

12. Law

These terms follow the laws of Pakistan.

13. Contact

Write to affiliates@pharmacozyme.com or message us on WhatsApp at +92 370 0199429.$terms$, now()),

('affiliate_rules', $rules$Affiliate Rules
Last updated: 8 November 2026

These are short, plain rules. They are part of the Affiliate Terms and Conditions.

1. Be honest

Say only true things about our courses, prices, certificates and discounts. Never promise jobs, exam results or income.

2. No spam

Do not send bulk or unwanted messages. Do not add people to groups without asking. Do not post your code over and over in groups where promotion is not allowed. Follow the rules of each platform and group.

3. Respect privacy

Never share another person's phone number or email. Never collect students' details for yourself. Send students to our registration page.

4. Discounts only through your code

Do not offer a bigger discount than the code gives, and do not promise discounts we have not approved. Do not share or sell your code or private link to others.

5. Do not pretend to be us

Do not say you work for PZ Academy, do not use our logo as if you were us, and do not make accounts or pages that look like ours.

6. No cheating

No fake registrations, no registering yourself to earn commission, no registering people under false details, no tricks to make a sale look like yours.

7. Look after students

Answer their questions politely. Send payment or course problems to us. Do not handle money yourself. Never collect payments for us.

8. If you break the rules

We may remove commission from the sales involved, pause or end your account, and tell the people affected.$rules$, now()),

('affiliate_privacy', $privacy$Affiliate Privacy Policy
Last updated: 8 November 2026

This policy explains what we do with your details when you apply to, or join, the PZ Academy Affiliate Programme run by Pharmacozyme.

1. What we collect

From your application: your name, email, WhatsApp number, city and country, whether you are a student or professional, your university or organization, your field, your answers about experience and skills, the hours you can give, an optional LinkedIn link, and why you want to join. We also record when you accepted the terms.

When you are an affiliate: your code, your team colour (if any), the sales made with your code or link, your commission and payouts, and the payment details you give when you ask for a payout.

From your link: we count visits to pages opened through your private link, without storing the visitor's name.

2. Why we use it

To review your application, run the programme, pay you, keep a fair leaderboard, send you emails about your account and results, and protect our programme from fraud and misuse.

3. Who sees it

Our team members who manage affiliates.

Our email provider (Brevo), only to send you the emails about your account.

Other affiliates and the public see only your first name, last initial, team colour and paid count on the leaderboard. They do not see your email, phone, city or money.

We do not sell your details.

4. How long we keep it

We keep your details while you are an affiliate and for 2 years after, for records and disputes, unless the law asks us to keep them longer. You can ask us to delete your details sooner, except where we must keep them (for example, payout records).

5. Your choices

You can ask to see, correct or delete your details, or leave the leaderboard, by writing to affiliates@pharmacozyme.com. We will answer within 30 days.

6. Security

We keep your details in protected systems and limit who can open them. No system is perfectly safe, so keep your private link private.

7. Changes and contact

We may update this policy and will show the new version on the affiliate pages. Contact: affiliates@pharmacozyme.com.$privacy$, now())
on conflict (key) do update set body = excluded.body, updated_at = excluded.updated_at;

-- Check after pasting: each one should show a number above 1000.
select key, length(body) as chars, updated_at from public.site_terms where key like 'affiliate_%' order by key;
