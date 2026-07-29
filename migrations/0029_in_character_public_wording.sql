UPDATE faq_entries
SET answer_markdown = replace(answer_markdown, 'federal and Florida-inspired RP law', 'federal law, the Miami legal framework'),
    updated_at = CURRENT_TIMESTAMP
WHERE instr(answer_markdown, 'federal and Florida-inspired RP law') > 0;

UPDATE faq_entries
SET answer_markdown = replace(answer_markdown, 'Florida-inspired RP law', 'Miami legal framework'),
    updated_at = CURRENT_TIMESTAMP
WHERE instr(answer_markdown, 'Florida-inspired RP law') > 0;

UPDATE faq_entries
SET answer_markdown = replace(answer_markdown, 'For practical roleplay purposes', 'For Department operating purposes'),
    updated_at = CURRENT_TIMESTAMP
WHERE instr(answer_markdown, 'For practical roleplay purposes') > 0;

UPDATE faq_entries
SET answer_markdown = replace(answer_markdown, 'Representation of the People of the State of California or Miami Stories', 'Representation of the People of Miami Stories'),
    updated_at = CURRENT_TIMESTAMP
WHERE instr(answer_markdown, 'People of the State of California or Miami Stories') > 0;

UPDATE faq_entries
SET answer_markdown = 'The Miami Stories Department of Justice coordinates court administration, prosecutorial review, attorney licensing, public defense access, and records administration through separate operating divisions.
The divisions remain functionally separate even though they operate within one coordinated Department structure:
- Judicial Division
- Prosecutorial Division
- Administrative and Bar Association Division
This structure keeps Department procedure clear, accessible, and accountable for the public.',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'faq-why-is-the-doj-used-as-an-umbrella-institution';
