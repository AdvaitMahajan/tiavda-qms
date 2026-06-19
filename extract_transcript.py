import json, base64, sys

jsonl_path = r'C:\Users\AmarnathPandey\.claude\projects\c--Users-AmarnathPandey-tiavda-qms\d3f48f00-662d-4e73-a9b2-3723a6520126.jsonl'
out_path = r'C:\Users\AmarnathPandey\tiavda-qms\Transcript.pdf'

with open(jsonl_path, 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        if i == 2:  # line 3 (0-indexed)
            data = json.loads(line)
            content = data['message']['content']
            doc_count = 0
            for item in content:
                if item.get('type') == 'document':
                    doc_count += 1
                    if doc_count == 3:  # Third document = Transcript
                        b64data = item['source']['data']
                        pdf_bytes = base64.b64decode(b64data)
                        with open(out_path, 'wb') as out:
                            out.write(pdf_bytes)
                        print(f'Wrote Transcript PDF: {len(pdf_bytes)} bytes to {out_path}')
                        break
            break
