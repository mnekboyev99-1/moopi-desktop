---
description: Ertalabki brifingni Claude'ning rejali vazifasi qilib sozlash (har kuni, obuna ichida)
---
Foydalanuvchi uchun har kuni ertalab MOOPI brifingini yozadigan Claude rejali vazifasini (routine) sozla.
U foydalanuvchining o'z Claude hisobida, kompyuter o'chiq bo'lsa ham ishlaydi; MOOPI kaliti sarflanmaydi.
Foydalanuvchi bilan uning tilida, sodda gaplash; texnik so'zlarni ishlatma.

1. `schedule` ko'nikmasini yukla (Skill vositasi): undagi muhitlar (environment) va claude.ai'da ulangan
   konnektorlar ro'yxati kerak. Foydalanuvchi "yaratish"ni allaqachon tanlagan — amal turini so'rama.
2. Ulangan konnektorlar orasida MOOPI (URL `https://mcp.moopi.uz/mcp`) bormi, qara. Yo'q bo'lsa,
   foydalanuvchiga shuni ayt va shu yerda to'xta:
   claude.ai → Sozlamalar (Settings) → Connectors → «Add custom connector» → nomi: MOOPI, URL:
   https://mcp.moopi.uz/mcp → «Connect» → MOOPI email va paroli bilan kiring (paroli yo'q bo'lsa, MOOPI
   ilovasida Sozlamalar → Hisob → parol o'rnating). Keyin shu yerga /ertalabki-brifing deb yozing.
3. RemoteTrigger `list` bilan «MOOPI ertalabki brifing» nomli vazifa bormi, tekshir. Bo'lsa, yangisini
   yaratma: vaqti `{cron}` bo'lmasa, `update` bilan to'g'rila va shuni ayt.
4. Yo'q bo'lsa, foydalanuvchiga bir gapda ayt — har kuni {time} da ({timezone}), uning Claude obunasi
   ichida — va roziligini olib, RemoteTrigger `create` bilan yarat:
   - name: `MOOPI ertalabki brifing`
   - cron_expression: `{cron}` (UTC; bu {timezone} bo'yicha {time})
   - environment: ro'yxatdagi Default muhit
   - model: `claude-sonnet-5-5`
   - repozitoriy (sources) yo'q
   - mcp_connections: faqat MOOPI konnektori
   - prompt, o'zgartirmasdan:
     ```
     You write the morning briefing of a MOOPI user (a small-business owner in Uzbekistan). Use only the MOOPI connector.
     1. Call morning_briefing_facts. If it says the briefing is switched off or already delivered today, stop.
     2. Write the briefing exactly by the rules it returns, from its facts only, in the language those rules name.
        Use other MOOPI tools only where those rules ask for them (create_task for a confirmed meeting, list_tasks, reading memory).
     3. Call deliver_morning_briefing with the briefing text alone.
     Do nothing else: no files, no repositories, no messages to other people.
     ```
5. Yaratilgach ayt: birinchi brifing keyingi {time} da MOOPI ilovasiga va Telegramga keladi; vazifa
   havolasi https://claude.ai/code/routines/<id>. Hozir sinab ko'rmoqchi bo'lsa, RemoteTrigger `run` bilan
   bir marta ishga tushir — bugungi brifing allaqachon bo'lsa, vazifa hech narsa yubormaydi.
