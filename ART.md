# 약국 CCTV 아트 리소스

기존 콘셉트 시안은 작업 폴더에서 확인되지 않아 새 일러스트를 제작했습니다. 네 개의 원본 시트는 내장 ImageGen으로 생성했고, 첫 버전의 화면에는 투명 배경의 개별 WebP 33장을 사용했습니다. 현재 실내 배경과 직원 구성은 아래의 추가 시안 항목에 정리했습니다.

## 사용한 프롬프트

### 직원 6명

> Production-ready transparent game sprite atlas, landscape 3:2, evenly spaced 3 columns by 2 rows. Six isolated full-body Korean adult human characters, one per cell. Premium softly textured, hand-painted gouache and clay-like cozy 2.5D life-sim, warm peach light and chestnut shadows. Two-head-tall chibi proportions with large heads, warm cheeks, small shoes. Three-quarter front, looking slightly right, camera from slightly above. Both arms visible and empty, feet separate. Use the following outfits in reading order: woman pharmacist with chocolate bob and cream coat over mint; man pharmacist with glasses, brown hair and amber cardigan; woman with auburn ponytail and mustard apron; woman with loose wavy dark hair and rose cardigan; man with fluffy black hair and pale denim overalls; woman with messy bun and lilac sweater. Uniform height, six separate silhouettes, clear margins, true alpha transparency, no text, floor or cast shadows.

### 업무 공간과 가구

> Transparent 4 by 3 game furniture atlas. Cozy gouache-painted isometric miniature Korean pharmacy and creative office with rounded edges, honey oak, cream paint, pale mint, warm butter, wood grain and tiny details. Matching tilted orthographic camera. One fully isolated prop per cell with generous margins. Row one: wooden apothecary workbench, mint syrup counter with colorful glass bottles, curved cream register counter, oval consultation table with blush chairs. Row two: stocked oak shelf, computer desk, sage loveseat, espresso bar. Row three: monstera planter, cardboard boxes and crate, wooden-frame cream hammock, low oak bench with folded rose quilt. No people, words, floors, or large drop shadows.

### 정원과 소품

> Landscape 3:2 transparent game asset atlas, evenly spaced four columns by three rows. Hand-painted gouache and 2.5D Korean life-sim, mint, cream, honey oak and warm beige with delicate lighting. One prop per cell. Row one: lilac planter, olive tree, flower patch, cream front door. Row two: first-aid caddy, teacups and biscuits, round footstool, arched picket gate. Row three: flowering topiary, open mint book, oak memo board, open cardboard box. Clear margins, transparent background, no shadows, no text and no people.

### 별장 자세

> Use the bottom-right character from the staff atlas as the identity reference. Three isolated full-body poses of the same Korean adult woman with dark messy bun, mauve lilac knit sweater, tan trousers and cream shoes in a wide single row: seated reading a mint book, lying diagonally asleep with hands under her cheek, and seated stretching both hands overhead. Preserve hair, expression, proportions, aged gouache texture, camera angle and warm palette. True alpha transparency, no furniture, floor or lettering.

## 추가 제작 규격

- 인물 기본 자세는 투명 WebP를 사용합니다. 높이 약 480px의 원본에 머리 위와 신발 아래 여백을 작게 유지하고, 두 발은 서로 떨어뜨립니다. 걷기에서 발 부분을 나눠 움직이므로 신발이 겹치면 보행 품질이 떨어집니다.
- 별장 자세는 선택 사항입니다. 같은 직원의 독서, 낮잠, 기지개 WebP 파일을 각 350px 높이로 제작하고 `restArt`에 지정합니다.
- 가구는 개체별로 투명 WebP를 사용합니다. 보통 가로 300~380px, 세로 250~360px, 큰 화분도 같은 시점을 유지합니다. 바닥이 이미지에 있으면 이동 중 가려지는 순서를 맞추기 어려우므로 개체만 내보냅니다.
- 가구의 화면 크기와 보행을 막는 바닥 면적은 `layout.ts`에서 각각 조정합니다. 사람이나 가구의 원본에 그림자를 굽지 않고 화면의 바닥 기준점에서 따로 그립니다.

## 선택한 실내 배경과 추가 직원

- 화면 전체를 채우는 원본 실내 일러스트는 `previews/약국 실내 전체 배경.png`에 있습니다. 실행 파일에는 원본 1586×992 크기의 WebP를 사용합니다.
- 신규 인물 10종은 `src/art/staff-7.webp`부터 `staff-16.webp`까지에 있습니다. 원본 시안과 투명 WebP 후보는 `previews/`에 보관합니다. [신규 캐릭터 시안](previews/신규%20캐릭터%2010명.png)과 [제작 프롬프트](previews/아트%20프롬프트.md)를 참조할 수 있습니다.
- 실내 가구의 바닥 면적은 `src/layout.ts`에서, 화면에서 인물을 가릴 윤곽은 `src/interior.ts`에서 조정합니다. 별장과 업무 소품은 개별 투명 이미지입니다.


## 실내 리뉴얼

- 새 배경은 아치형 창과 원목 벽면, 업무 구역별 러그, 앞쪽 식물까지 포함한 1586×992 일러스트입니다. 원본은 [리뉴얼 약국 배경](previews/리뉴얼%20약국%20배경.png)에 저장했습니다.
- 조제대, 시럽 작업대, 재고 선반, 사무 책상, 상담 테이블, 계산대, 소파, 커피장을 배경과 맞는 원근과 색감으로 다시 제작했습니다. 원본 시트는 [리뉴얼 가구 에셋](previews/리뉴얼%20가구%20에셋.png)이며 실행 파일은 `src/art/room-*.webp`의 개별 이미지를 사용합니다.
- 캐릭터 원본과 크기 설정을 유지했습니다. `src/layout.ts`에서 개별 가구 크기와 발이 지나는 바닥 면적, 작업 자리와 표지 위치를 조정합니다.
- 사용한 내장 ImageGen 프롬프트는 [리뉴얼 아트 프롬프트](previews/리뉴얼%20아트%20프롬프트.md)에 있습니다.

## 실내 배경 움직임

- 양쪽 창의 커튼과 앞쪽 화분은 실내 일러스트에서 해당 영역만 Canvas로 다시 그립니다. 커튼 봉과 화분 아래쪽을 기준으로 흔들림이 작아지며, 각 영역의 반복 주기를 다르게 설정했습니다.
- 운영체제의 동작 줄이기 설정이 켜지면 이 움직임을 멈춥니다. 설정 변경은 일시정지 상태에서도 반영됩니다.
- [Chrome 재생 화면](verification/ambient-breeze.png), [커튼과 화분 움직임](verification/ambient-breeze-preview.webp)
- 시럽병 세 개의 물결과 기포, 모니터의 목록 강조, 커피잔의 김은 각 소품 일러스트 좌표에 맞춰 그립니다. 소품과 같은 깊이 순서를 사용하므로 앞을 지나는 직원에게 가려집니다.
- [소품 움직임 미리보기](verification/fixture-effects-preview.webp), [전체 화면](verification/fixture-effects.png)
- 창밖과 실내, 휴무 별장은 화면 시계에 맞춰 낮·노을·밤의 색을 조금씩 섞습니다. 밤이 가까워지면 실내 조명이 서서히 밝아지고 창밖의 달과 별이 나타납니다.
- [낮·노을·밤 비교](verification/lighting-comparison.jpg)

## 직원 보행

- 이동한 거리에 맞춰 두 발을 번갈아 움직입니다. 발을 움직일 때 다리 윗부분은 몸에 붙이고, 출발과 정지에는 짧은 전환을 적용합니다. 방향을 바꿀 때는 캐릭터가 돌아서는 모양을 잠깐 거칩니다.
- [직원 보행 미리보기](verification/staff-walk-preview.webp), [전체 화면](verification/staff-walk.png)

## 시럽 작업 동작

- 손에 든 병의 기울기에 맞춰 병 입구와 컵을 액체 줄기로 연결합니다. 컵의 액체 높이가 올라가는 동안 병의 액체 높이는 낮아집니다. 직원별로 시럽 작업을 시작하는 순간과 반복 간격이 다릅니다.
- [시럽 따르기 미리보기](verification/syrup-pour-preview.webp), [전체 화면](verification/syrup-pour.png)

## 조제와 포장 동작

- 조제할 때는 약병을 들어 라벨 쪽으로 고개를 살짝 기울인 뒤 병을 내립니다. 포장할 때는 양손이 포장지를 따라가며 덮개를 접고, 접은 포장을 옆으로 옮깁니다.
- [조제·포장 미리보기](verification/dispense-pack-preview.webp), [전체 화면](verification/dispense-pack.png)

## 공간 표지

- 상담·계산·휴게 표지를 각 가구 가까이 배치합니다. 표지와 직원은 같은 깊이 순서로 그려서 직원이 앞으로 지나가는 동안 표지가 뒤에 보입니다.
- [표지 배치 화면](verification/zone-signs-overview.png), [직원이 지나가는 화면](verification/zone-signs-walk.png)

## 계산 동작

- 한 손은 계산 단말기를 받치고 다른 손은 여러 키를 차례로 누릅니다. 마지막 입력이 끝나면 손을 빼고, 화면에 완료 표시가 보일 때 고개를 끄덕입니다.
- [계산 동작 미리보기](verification/checkout-animation-preview.webp), [전체 화면](verification/checkout-animation.png)

## 상담과 복약지도

- 상담할 때는 손을 펼쳐 설명한 뒤 손을 내리고 고개를 끄덕입니다. 복약지도할 때는 안내지를 들어 한 손으로 받치고, 다른 손으로 위쪽 항목부터 차례로 짚습니다.
- [상담·복약지도 미리보기](verification/counsel-guidance-preview.webp), [전체 화면](verification/counsel-guidance.png)

## 재고 정리

- 재고 정리 자리로 향하는 직원은 상자를 들고 걷습니다. 도착 후 상자를 선반 하단의 원목 받침 높이로 올려놓고 손을 뗍니다. 받침은 선반 일러스트 위에 별도 층으로 그립니다.
- [재고 정리 미리보기](verification/stock-carry-preview.webp), [전체 화면](verification/stock-carry.png)

## 휴게 공간 동작

- 커피잔을 입가로 들어 기울였다가 내린 뒤, 양팔을 천천히 올려 기지개를 켭니다. 팔을 움직일 때는 몸통 일러스트에서 해당 자세의 팔 부분을 분리해 그립니다.
- [커피 휴식 미리보기](verification/coffee-break-preview.webp), [전체 화면](verification/coffee-break.png)
- 식사할 때는 한 손으로 그릇을 받치고 다른 손으로 숟가락을 올립니다. 숟가락은 그릇과 입가 사이를 오가며, 직원별로 움직이는 타이밍이 다릅니다.
- [식사 미리보기](verification/lunch-preview.webp), [전체 화면](verification/lunch.png)

## 직원 인사

- 가까이 선 직원 중 한 명이 손바닥을 펴서 흔들고, 상대는 잠시 뒤 고개를 끄덕입니다. 움직이는 중이거나 업무에 양손을 쓰는 직원은 먼저 손을 흔들지 않습니다.
- [직원 인사 미리보기](verification/staff-greeting-preview.webp), [전체 화면](verification/staff-greeting.png)

## 별장 벤치 독서

- 내장 ImageGen으로 태호의 벤치 독서 자세를 제작했습니다. 서 있는 태호 일러스트를 인물 기준으로, 유나의 독서 자세를 구도 기준으로 사용했습니다. 실행 파일에는 239×350 투명 WebP를 넣었습니다. [태호 독서 스프라이트](src/art/rest-taeho-bench.webp)
- 태호는 정원 산책을 마치면 벤치로 돌아옵니다. 책등에 맞춰 책장을 넘기고, 앞쪽 화분을 옮겨 인물과 책이 보이도록 했습니다. [별장 움직임](verification/cottage-reading-preview.webp), [전체 화면](verification/cottage-reading.png)

> Create one production-ready full-body transparent 2.5D miniature game sprite for an original cozy Korean pharmacy management game. EDIT/reference images: first image defines the exact male character Taeho. Match the young adult man's face, big black-brown eyes, peach cheek, round proportions, very dark short voluminous compact curls, olive green hoodie with ecru drawstrings, tan straight trousers and ivory sneakers. Do not borrow hair, face or clothes from the second image. The second, a seated tile, defines the matching soft warm light, delicately textured gouache painting style, chibi proportions, camera slightly above, posture, handheld book and composition. Create a seated reading version of the male character in three-quarter view, facing slightly to screen right; pelvis seated on the absent bench, thighs slope gently down to the right with both knees close together, visible feet towards the lower right. He holds a small open cream-paged pale teal book with both hands at his lap, his gaze softly toward the page. A quiet happy expression. The head must stay as large as the other chibi sprite. Use neatly defined fingers and miniature shoes. Render an isolated silhouette with all extremities and plenty of transparent margin. Warm light from upper left. No seat, no pillow, no ground, no flooring, no shadows outside the figure, no frame, no letters, nothing else. True transparent alpha, portrait orientation. One character and one pose.

## 여성 약사 외형 3종

- 내장 ImageGen에서 기존 약사 스프라이트를 그림체 기준으로 사용했습니다. 세 인물 모두 높이 486px의 투명 WebP로 넣고, 가운 소매 색과 눈 위치를 각 스프라이트에 맞췄습니다.
- [금테 안경](src/art/staff-17.webp), [살구색 블라우스](src/art/staff-18.webp), [올림머리](src/art/staff-19.webp)

> Original game production sprite for a cozy 2.5D Korean pharmacy. Create a NEW adult Korean woman pharmacist with the same camera, proportions, texture, lighting, and silhouette scale as the reference art, but a distinct identity; same 2-head-tall miniature chibi body, head roughly 40% of sprite height, gentle smile and very large warm dark eyes. Strictly match the existing three-quarter front looking toward screen right, looking slightly up from the camera top tilt, orange-warm left lighting, detailed textured hand-painted gouache, soft brown shadows, tiny shoes. Stance neutral, empty hands hanging separately on both sides of the torso, flat soles aligned and shoes clearly visible, full body tip to toe, one isolated person centered, tightly framed but clear 5% alpha margin. Cream ivory long pharmacists' lab coat with visible pockets. No floor, no background, no props, no lettering, no cast shadow, genuine transparency, portrait.

> A distinct dark-haired character with short neat blunt chocolate-brown bob softly tucked behind one ear, thin rounded warm gold and brown glasses visibly worn above her nose, bright soft eyes visible through clear lenses, pale sky-blue collar and dark teal tapered trousers, brown loafers.

> Character with airy warm chestnut waves pulled into a low loose ponytail placed behind one shoulder, side fringe and tiny muted peach scrunchie, peach blouse, soft warm tan trousers, brown shoes, open friendly expression. Bare face with no glasses.

> Character with smooth deep-black hair in a rounded high bun with loose short wisps, sage blouse, gray-blue straight trousers and warm brown shoes, gentle confident smile. Bare face with no glasses.

## 강아지 모카와 고양이 코코

- 내장 ImageGen에서 기존 약사 스프라이트를 그림체와 시점 기준으로 사용했습니다. 실행 파일에는 높이 340px의 투명 WebP 두 장을 포함했습니다. [모카](src/art/pet-dog.webp), [하얀 고양이 코코](src/art/pet-cat-white.webp)

> Create a single original isolated transparent game sprite for a cozy illustrated miniature 2.5D Korean pharmacy. The attached human sprite is STYLE AND CAMERA reference only. Match its granular hand-painted gouache texture, warmly lit matte contours, painterly natural color, big round expressive friendly eyes, rounded appealing forms, slight top-down three-quarter camera. One tiny young domestic pet on all four paws in an easy walking stance, body extending to the LEFT and face looking towards the RIGHT with a hint toward camera. Show the whole head, tail, and all paws with clear side spacing, with four legs individually legible. Natural cute quadruped, big head, small stature, chest/feet proportioned like a believable toy. Clear silhouette, excellent readability when displayed at 66 px wide. This is a full sprite with plenty of alpha padding. No floor, no background, no text, no cast shadow, no humans, no frame. Genuine transparent background.

> A small buttercream and honey colored corgi puppy with a wide round cream muzzle, triangular gently upright ears, saddle of light apricot fur, short sturdy legs, tiny happy pink tongue, round dark eyes and a muted leaf-green bandana with no pattern. Very readable gold and ivory silhouette.

> A small warm silver-gray tabby kitten with delicate gray stripes, soft ivory muzzle, chest and toes, big dark hazel eyes, and a long tail held upright with a soft hooked tip. A modest dusty-rose collar with a small brass bell. The kitten's face is slightly smiling and curious. Muted pastel colors, clearly different silhouette from a dog.

> Recolor this exact isolated transparent sprite of Coco the kitten for a 2.5D illustrated cozy Korean pharmacy web scene. Change the gray tabby fur to an unmistakable solid warm snow-white coat without stripes or dark-colored patches. Use warm ivory and very pale cream and taupe-blue in soft shadows to make white fur readable against a light oak floor. Preserve the current shape and proportions, generous open round hazel eyes, small pink nose and ear interiors, expressive small smile, side pose facing screen right, curled upright tail, four visible paws, dusty-rose collar with brass bell, the same detailed hand-painted gouache rendering and lighting. One animal only. Keep camera angle and full uncut silhouette with clear margins, natural shadow only within the body. True transparent background; no floor, scene, captions, or external shadow.

## 붕어빵 가판대

기존 커피 가구를 붓질과 카메라 시점의 기준으로 사용했습니다. 가판대는 높이 440px의 투명 WebP로 저장했습니다. 판매할 때 드는 붕어빵과 종이봉투는 캐릭터 손과 함께 그려집니다. [가판대 이미지](src/art/room-pastry.webp)

> Create one isolated transparent 2.5D asset for a cozy Korean miniature illustrated pharmacy scene. A small cute Korean bungeoppang fish-shaped pastry street cart as a warm indoor pop-up stand. Reference image is STYLE and CAMERA only: match the softly detailed painterly gouache, warm honey-colored wood, sage mint accents, slight high-angle three-quarter view, artisanal textured finish. Cart is compact and rounded, about 1 m high including its striped cream-and-apricot small canvas canopy on thin wood supports. On the countertop a clear shallow display tray holds 5 unmistakable golden fish-shaped waffles with fin and scale impressions, a small cast iron fish waffle mold beside it, and a few neatly folded small kraft takeaway bags. A tiny simple gold fish pastry motif on the front panel, no lettering. Include soft rounded cabinet corners and one small side wheel. Keep counter modest and complete silhouette fully in frame. One standalone object. No people, no background, no floor, no cast shadow outside its feet, no typography, no logos. Genuine transparent alpha background.
