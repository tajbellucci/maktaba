import html, os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), "files"))
pages = {
 1: ["كتاب الطهارة", "الطهارة شرط لصحة الصلاة، وهي نوعان: طهارة من الحدث وطهارة من الخبث.", "والوضوء فرضه أربعة: غسل الوجه واليدين ومسح الرأس وغسل الرجلين."],
 2: ["باب الصلاة", "الصلاة عماد الدين، وهي أول ما يحاسب عليه العبد يوم القيامة.", "ووقت الفجر من طلوع الصبح الصادق إلى طلوع الشمس."],
 3: ["باب الزكاة", "الزكاة ركن من أركان الإسلام، تجب في الذهب والفضة وعروض التجارة.", "ونصاب الفضة مائتا درهم، ونصاب الذهب عشرون مثقالا."],
 4: ["باب الصوم", "الصوم هو الإمساك عن المفطرات من طلوع الفجر إلى غروب الشمس بنية.", "ويجب صوم رمضان برؤية الهلال أو بإكمال شعبان ثلاثين يوما."],
 5: ["باب الحج", "الحج فرض على المستطيع مرة في العمر، وأركانه الإحرام والوقوف بعرفة والطواف.", "وتجب الصلاة في الحرم بمائة ألف صلاة كما ورد في الحديث."],
 6: ["باب النكاح", "النكاح سنة مؤكدة لمن قدر عليه، وشرطه الإيجاب والقبول وحضور الشهود.", "والمهر حق للمرأة، وأقله عشرة دراهم عند الحنفية."],
}
OFFSET = 2
txt = "﻿مثال كتاب فقه\n\n" + "\n\n".join(f"[ص {n}]\n" + "\n".join(lines) for n, lines in pages.items()) + "\n"
open("sample-book.txt", "w", encoding="utf-8").write(txt)
css = """<style>@page{size:A5;margin:14mm} body{font-family:'Segoe UI','Arial',sans-serif;direction:rtl;font-size:15pt;line-height:2}
.pg{page-break-after:always;box-sizing:border-box;height:176mm;overflow:hidden;border:2px solid #444;padding:8mm;position:relative} .pg:last-child{page-break-after:auto}
.num{position:absolute;top:4mm;left:6mm;font:bold 40pt Arial;color:#c0392b;direction:ltr} .lab{font:bold 11pt Arial;color:#555;direction:ltr}
h2{margin:6mm 0 3mm}</style>"""
def pg(label, body, big): return f'<div class="pg"><div class="num">{big}</div><div class="lab">{label}</div>{body}</div>'
doc = [pg("COVER", "<h1>مثال كتاب فقه</h1><p>غلاف الكتاب</p>", "PDF 1"), pg("CONTENTS", "<h2>الفهرس</h2><p>الطهارة، الصلاة، الزكاة، الصوم، الحج، النكاح</p>", "PDF 2")]
for n, lines in pages.items():
    doc.append(pg(f"book page {n}", f"<h2>{html.escape(lines[0])}</h2>" + "".join(f"<p>{html.escape(l)}</p>" for l in lines[1:]), f"PDF {n+OFFSET}"))
open("sample-book.html", "w", encoding="utf-8").write(f"<!doctype html><meta charset=utf-8>{css}{''.join(doc)}")
print("ok")
