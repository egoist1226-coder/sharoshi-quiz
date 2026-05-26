import json, os, shutil

path = r"C:\Users\miyat\OneDrive\デスクトップ\ClaudCode\sharoshi-quiz\data\kousei_nenkin_01.json"

with open(path, encoding="utf-8") as f:
    data = json.load(f)

new_qs = [
    {
        "id": 92,
        "category": "標準報酬月額及び標準賞与額",
        "difficulty": "normal",
        "source_no": 92,
        "question": "第1号厚生年金被保険者であったが令和4年5月1日に資格を喪失した甲が、令和5年6月15日に3歳未満の子の養育を開始し、令和5年7月1日に再び第1号厚生年金被保険者の資格を取得した場合、法第26条に規定する標準報酬月額の特例は適用される。",
        "answer": False,
        "explanation": "（法26条1項）特例の適用には「基準月」（養育開始月前月、被保険者でない場合は前1年以内の被保険者であった直近の月）が必要。甲は令和5年6月15日に養育開始したため、前月の令和5年5月前1年以内（令和4年5月〜令和5年4月）に被保険者であった月がなければならないが、令和4年5月1日喪失・令和5年7月1日取得のため当該期間に被保険者月がない。基準月が存在しないため特例は適用されない。"
    },
    {
        "id": 93,
        "category": "標準報酬月額及び標準賞与額",
        "difficulty": "normal",
        "source_no": 93,
        "question": "第1子の育児休業終了後に法第26条の標準報酬月額特例が適用された被保険者乙の従前標準報酬月額は30万円であったが、育児休業等終了時改定により24万円に改定された。その後、乙が第2子の養育に係る本特例の申出を行い適用された場合、乙の従前標準報酬月額は24万円である。",
        "answer": False,
        "explanation": "（法26条1項）「従前標準報酬月額」は基準月の標準報酬月額をいう。本特例により当該子以外の子に係る基準月の標準報酬月額が標準報酬月額とみなされている場合は、そのみなされた額が従前標準報酬月額となる。したがって第2子の特例適用時の従前標準報酬月額は第1子特例時の「30万円」である（24万円ではない）。"
    },
    {
        "id": 94,
        "category": "標準報酬月額及び標準賞与額",
        "difficulty": "normal",
        "source_no": 94,
        "question": "法第26条の標準報酬月額特例の適用を受けている被保険者の第1子が満3歳に達する前に第2子の養育が始まり、第2子の養育にも本特例の適用を受ける場合は、第1子の養育に係る本特例の適用期間は、第2子に係る産前産後休業を開始した日の翌日の属する月の前月までとなる。",
        "answer": True,
        "explanation": "（法26条1項）本肢のとおり。第2子に係る産前産後休業開始日の翌日の属する月の前月が第1子特例の終期となる（第2子が3歳に達した日の翌日の属する月の前月ではない）。"
    },
    {
        "id": 95,
        "category": "標準報酬月額及び標準賞与額",
        "difficulty": "normal",
        "source_no": 95,
        "question": "法第26条に規定する3歳に満たない子を養育する被保険者等の標準報酬月額の特例が適用される場合には、老齢厚生年金の額の計算のみならず、保険料額の計算に当たっても、実際の標準報酬月額ではなく従前標準報酬月額が用いられる。",
        "answer": False,
        "explanation": "（法26条1項）本特例は従前標準報酬月額を年金額計算における平均標準報酬額の計算基礎とみなすものであり、保険料の計算には実際の標準報酬月額が用いられる。"
    },
    {
        "id": 96,
        "category": "標準報酬月額及び標準賞与額",
        "difficulty": "normal",
        "source_no": 96,
        "question": "法第26条に規定する3歳に満たない子を養育する被保険者等の標準報酬月額の特例についての実施機関に対する申出は、第1号厚生年金被保険者又は第4号厚生年金被保険者はその使用される事業所の事業主を経由して行い、第2号厚生年金被保険者又は第3号厚生年金被保険者は事業主を経由せずに行う。",
        "answer": True,
        "explanation": "（法26条4項）本肢のとおり。なお事業主は当該申出（第1号厚生年金被保険者等に係るものに限る）を受けたときは、速やかに申出書等を日本年金機構に提出しなければならない。"
    },
]

data.extend(new_qs)

true_count  = sum(1 for q in data if q["answer"])
false_count = sum(1 for q in data if not q["answer"])
print(f"総問題数: {len(data)} | True:{true_count} | False:{false_count} | 差:{abs(true_count-false_count)}")

with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("kousei_nenkin_01.json 更新完了（全96問・完結）")

# 今回送信された写真のみ移動（フォルダに存在するもの）
photo_dir = r"C:\Users\miyat\Downloads\社労士試験\厚生年金保険法"
done_dir  = r"C:\Users\miyat\Downloads\社労士試験\厚生年金保険法\送信済"
# 今回処理した写真（4枚チャット経由のため実ファイル名は不明）
# フォルダ内にあるjpgを確認して報告のみ
if os.path.exists(photo_dir):
    files = [f for f in os.listdir(photo_dir) if f.endswith('.jpg') and os.path.isfile(os.path.join(photo_dir, f))]
    print(f"フォルダ内のjpgファイル: {files}")
