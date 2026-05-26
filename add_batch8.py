import json, os, shutil

path = r"C:\Users\miyat\OneDrive\デスクトップ\ClaudCode\sharoshi-quiz\data\kousei_nenkin_01.json"

with open(path, encoding="utf-8") as f:
    data = json.load(f)

new_qs = [
    {
        "id": 83,
        "category": "標準報酬月額及び標準賞与額",
        "difficulty": "normal",
        "source_no": 83,
        "question": "平成29年5月31日に育児休業を終えて同年6月1日に職場復帰した3歳に満たない子を養育する被保険者が、育児休業等終了時改定に該当した場合、その者の標準報酬月額は同年9月から改定される。また、当該被保険者を使用する事業主は、当該被保険者に対して同年10月に支給する報酬から改定後の標準報酬月額に基づく保険料を控除することができる。",
        "answer": True,
        "explanation": "（法23条の2第2項、法84条1項）育児休業等終了時改定に該当した場合、標準報酬月額は終了日の翌日（6月1日）から起算して2月を経過した日の属する月の翌月（9月）から改定される。事業主は前月の標準報酬月額に基づく保険料を翌月支給の報酬から控除できるため、10月支給の報酬から控除可能。"
    },
    {
        "id": 84,
        "category": "標準報酬月額及び標準賞与額",
        "difficulty": "easy",
        "source_no": 84,
        "question": "被保険者が産前産後休業終了日の翌日に育児休業等を開始している場合には、当該産前産後休業を終了した際の標準報酬月額の改定は行われない。",
        "answer": True,
        "explanation": "（法23条の3第1項）本肢のとおり。なお産前産後休業終了時改定が適用される場合、標準報酬月額は産前産後休業終了日の翌日から起算して2月を経過した日の属する月の翌月から改定される。"
    },
    {
        "id": 85,
        "category": "標準報酬月額及び標準賞与額",
        "difficulty": "normal",
        "source_no": 85,
        "question": "被保険者の報酬月額について、厚生年金保険法第21条第1項の定時決定の規定によって算定することが困難であるとき、又は同項により算定された報酬月額が著しく不当であるときは、実施機関が算定する額を当該被保険者の報酬月額とする。",
        "answer": True,
        "explanation": "（法24条1項）本肢のとおり。"
    },
    {
        "id": 86,
        "category": "標準報酬月額及び標準賞与額",
        "difficulty": "normal",
        "source_no": 86,
        "question": "同時に2以上の適用事業所で報酬を受ける厚生年金保険の被保険者について標準報酬月額を算定する場合においては、事業所ごとに報酬月額を算定し、その算定した額の平均額をその者の報酬月額とする。",
        "answer": False,
        "explanation": "（法24条2項ほか）事業所ごとに報酬月額を算定し、その「合算額」をその者の報酬月額とする（平均額ではない）。なお被保険者が船舶と事業所に同時に使用される場合は、船舶所有者からの報酬のみで算定する。"
    },
    {
        "id": 87,
        "category": "標準報酬月額及び標準賞与額",
        "difficulty": "normal",
        "source_no": 87,
        "question": "実施機関は、被保険者が賞与を受けた月に当該賞与額（千円未満切捨て）に基づき標準賞与額を決定する。この場合、当該標準賞与額が1つの適用事業所において年間の累計額が150万円を超えるときは、これを150万円とする。",
        "answer": False,
        "explanation": "（法24条の4第1項）上限は「年間累計額」ではなく「その賞与を受けた月における標準賞与額」についての上限である。当該月の標準賞与額が150万円を超えるときに150万円とする。"
    },
    {
        "id": 88,
        "category": "標準報酬月額及び標準賞与額",
        "difficulty": "normal",
        "source_no": 88,
        "question": "同時に2か所の適用事業所A及びBに使用される第1号厚生年金被保険者について、同一の月に適用事業所Aから200万円、適用事業所Bから100万円の賞与が支給された場合、適用事業所Aに係る標準賞与額は150万円、適用事業所Bに係る標準賞与額は100万円として決定され、合計250万円が当該月における標準賞与額とされる。",
        "answer": False,
        "explanation": "（法24条の4）各事業所の賞与額の合算額（200万円＋100万円＝300万円）でその月の標準賞与額を決定する。300万円＞150万円であるため、標準賞与額は150万円となる（250万円ではない）。"
    },
    {
        "id": 89,
        "category": "標準報酬月額及び標準賞与額",
        "difficulty": "hard",
        "source_no": 89,
        "question": "7月1日前の1年間を通じ4回以上の賞与が支給されているときは当該賞与を報酬として取り扱うが、当該年の8月1日に賞与の支給回数を年間3回に変更した場合、当該年の8月1日以降に支給される賞与から賞与支払届を提出しなければならない。",
        "answer": False,
        "explanation": "（昭53.6.20保発47号・庁保発21号ほか）支給回数が変更された場合でも、次期標準報酬月額の定時決定（7・8・9月の随時改定を含む）による標準報酬月額が適用されるまでの間は、当該賞与は引き続き報酬として取り扱われるため、賞与支払届を提出する必要はない。"
    },
    {
        "id": 90,
        "category": "標準報酬月額及び標準賞与額",
        "difficulty": "normal",
        "source_no": 90,
        "question": "被保険者の配偶者が出産した場合であっても、所定の要件を満たす被保険者は、厚生年金保険法第26条に規定する3歳に満たない子を養育する被保険者等の標準報酬月額の特例の申出をすることができる。",
        "answer": True,
        "explanation": "（法26条）本肢のとおり。"
    },
    {
        "id": 91,
        "category": "標準報酬月額及び標準賞与額",
        "difficulty": "normal",
        "source_no": 91,
        "question": "3歳に満たない子を養育している被保険者が標準報酬月額の特例の申出を行った場合、当該特例は、申出が行われた日の属する月前の月にあっては、申出が行われた日の属する月の前月までの3年間のうちにあるものに限られている。",
        "answer": False,
        "explanation": "（法26条1項）申出が行われた日の属する月前の月にあっては「2年間」のうちにあるものに限られている（3年間ではない）。"
    },
]

data.extend(new_qs)

true_count  = sum(1 for q in data if q["answer"])
false_count = sum(1 for q in data if not q["answer"])
print(f"総問題数: {len(data)} | True:{true_count} | False:{false_count} | 差:{abs(true_count-false_count)}")

with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("kousei_nenkin_01.json 更新完了")

# 写真ファイル確認・移動（ダウンロードフォルダに新しいファイルがあれば移動）
photo_dir = r"C:\Users\miyat\Downloads\社労士試験\厚生年金保険法"
done_dir  = r"C:\Users\miyat\Downloads\社労士試験\厚生年金保険法\送信済"
if os.path.exists(photo_dir):
    files = [f for f in os.listdir(photo_dir) if f.endswith('.jpg') and os.path.isfile(os.path.join(photo_dir, f))]
    if files:
        for p in files:
            src = os.path.join(photo_dir, p)
            dst = os.path.join(done_dir, p)
            shutil.move(src, dst)
            print(f"移動: {p}")
    else:
        print("移動対象のjpgファイルなし")
