import json, os

path = r"C:\Users\miyat\OneDrive\デスクトップ\ClaudCode\sharoshi-quiz\data\kousei_nenkin_01.json"

with open(path, encoding="utf-8") as f:
    data = json.load(f)

new_qs = [
    {
        "id": 61,
        "category": "被保険者等",
        "difficulty": "normal",
        "source_no": 61,
        "question": "任意適用事業所に使用される被保険者について、その事業所が適用事業所でなくなったことによる被保険者資格の喪失は、厚生労働大臣の確認によってその効力を生ずる。",
        "answer": False,
        "explanation": "（法18条1項ただし書）任意適用事業所が廃止の認可を受けて適用事業所でなくなった場合の被保険者資格の喪失は、厚生労働大臣の確認によらず効力が生じる。"
    },
    {
        "id": 62,
        "category": "被保険者等",
        "difficulty": "normal",
        "source_no": 62,
        "question": "適用事業所以外の事業所に使用される任意単独被保険者の被保険者資格の喪失は、厚生労働大臣の確認によってその効力を生ずる。",
        "answer": False,
        "explanation": "（法18条1項ただし書）任意単独被保険者の資格喪失も、厚生労働大臣の確認によらず効力が生じる。なお、第2〜4号厚生年金被保険者の資格の取得・喪失については法18条1〜3項の規定は適用されない（同条4項）。"
    },
    {
        "id": 63,
        "category": "被保険者期間",
        "difficulty": "easy",
        "source_no": 63,
        "question": "同一の月において被保険者の種別に変更があったときは、その月は変更後の被保険者の種別の被保険者であった月とみなす。同一月に2回以上変更があったときは、最後の種別の被保険者であった月とみなす。",
        "answer": True,
        "explanation": "（法19条5項）本肢のとおり。"
    },
    {
        "id": 64,
        "category": "被保険者期間",
        "difficulty": "normal",
        "source_no": 64,
        "question": "令和2年10月1日に資格取得した被保険者が令和3年3月30日に資格喪失した場合の被保険者期間は、令和2年10月から令和3年2月までの5か月間であり、令和3年3月は被保険者期間に算入されない。",
        "answer": True,
        "explanation": "（法19条1項）被保険者期間は資格取得月から喪失月の前月まで算入する。令和3年3月30日喪失→前月の令和3年2月まで→令和2年10月〜令和3年2月の5か月。"
    },
    {
        "id": 65,
        "category": "被保険者期間",
        "difficulty": "easy",
        "source_no": 65,
        "question": "被保険者期間を計算する場合には月によるものとし、被保険者の資格を取得した月からその資格を喪失した月の前月までをこれに算入する。",
        "answer": True,
        "explanation": "（法19条1項）本肢のとおり。"
    },
    {
        "id": 66,
        "category": "被保険者期間",
        "difficulty": "hard",
        "source_no": 66,
        "question": "令和2年3月1日採用で第1号厚生年金被保険者となった者が同月20日に退職し翌日資格喪失、国民年金第2号被保険者となった。同年4月1日に再度第1号厚生年金被保険者の資格を取得しても、同年3月分は厚生年金保険の被保険者期間に算入されない。",
        "answer": True,
        "explanation": "（法19条2項）資格取得月に資格を喪失し、その月に国民年金の第2号被保険者（第2号厚生年金被保険者を除く）の資格を取得した場合、その月は厚生年金保険の被保険者期間に算入されない。"
    },
    {
        "id": 67,
        "category": "被保険者期間",
        "difficulty": "easy",
        "source_no": 67,
        "question": "令和6年5月1日に厚生年金保険の被保険者資格を取得した者が同月15日に資格を喪失し、同日国民年金第1号被保険者の資格を取得した場合、同年5月分は1か月として厚生年金保険の被保険者期間に算入する。",
        "answer": False,
        "explanation": "（法19条2項）資格取得月に資格を喪失し、その月に国民年金の第1号被保険者の資格を取得した場合、当該月は厚生年金保険の被保険者期間に「算入されない」。"
    },
    {
        "id": 68,
        "category": "被保険者期間",
        "difficulty": "normal",
        "source_no": 68,
        "question": "国家公務員が令和7年7月21日に退職し翌日に厚生年金保険の被保険者資格を喪失した後、同月28日に民間企業に就職し被保険者資格を取得した場合、令和7年7月は第2号厚生年金被保険者であった月とみなされる。",
        "answer": False,
        "explanation": "（法19条5項）同一の月に被保険者の種別変更があったときは、変更後（最後）の種別の被保険者であった月とみなす。本肢の場合、令和7年7月は「第1号厚生年金被保険者」であった月とみなされる。"
    },
    {
        "id": 69,
        "category": "被保険者期間",
        "difficulty": "normal",
        "source_no": 69,
        "question": "昭和62年5月1日に第3種被保険者の資格を取得し、平成元年11月30日に資格を喪失した者の厚生年金保険の被保険者期間は36月である。",
        "answer": True,
        "explanation": "（法19条1項、昭60法附則47条4項）資格取得月（昭62年5月）から喪失月の前月（平元年10月）まで30月。第3種被保険者期間はこの30月に6/5を乗じた36月が厚生年金保険の被保険者期間となる。"
    },
]

data.extend(new_qs)

true_count  = sum(1 for q in data if q["answer"])
false_count = sum(1 for q in data if not q["answer"])
print(f"総問題数: {len(data)} | True:{true_count} | False:{false_count} | 差:{abs(true_count-false_count)}")

with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("更新完了")
