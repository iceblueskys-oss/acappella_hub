// 본인의 API 키와 공유 폴더 ID로 변경하세요
const GOOGLE_API_KEY = "AIzaSyCvRa2jV0lWoX9-rayyu5vNG7K4GuMUSSQ";
const FOLDER_ID = "1BDl7bfBY0S0kWRvtbJ5Kqgl9o9HgwUEj";

// 1. 파일명에서 제목과 파트별 첫 음 파싱 정규식
// 예: "Java Jive [S:E4,A:C4,T:G3,B:C3].pdf"
function parseSongMetadata(fileName) {
  const cleanName = fileName.replace(/\.pdf$/i, '');
  const match = cleanName.match(/^(.*?)\s*\[(.*?)\]$/);

  if (!match) {
    return { title: cleanName, notes: {} };
  }

  const title = match[1].trim();
  const notesStr = match[2]; // "S:E4,A:C4,T:G3,B:C3"
  const notes = {};

  notesStr.split(',').forEach(partItem => {
    const [part, note] = partItem.split(':');
    if (part && note) {
      notes[part.trim().toUpperCase()] = note.trim().toUpperCase();
    }
  });

  return { title, notes };
}

// 2. 구글 드라이브 폴더 내 PDF 목록 조회 (files.list)
async function fetchDriveSheets() {
  const query = `'${FOLDER_ID}' in parents and mimeType = 'application/pdf' and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&key=${GOOGLE_API_KEY}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const data = await res.json();
    
    // 파일명 파싱 적용
    return (data.files || []).map(file => {
      const meta = parseSongMetadata(file.name);
      return {
        id: file.id,
        fileName: file.name,
        title: meta.title,
        notes: meta.notes
      };
    });
  } catch (err) {
    console.error("구글 드라이브 파일 목록 로드 실패:", err);
    alert("구글 드라이브 폴더를 불러오지 못했습니다. API 키와 폴더 권한을 확인해주세요.");
    return [];
  }
}

// 3. 선택한 PDF 파일 바이너리 다운로드 (pdf.js 렌더링용)
async function loadDrivePdf(fileId) {
  // 공개 파일 바이너리 다운로드 엔드포인트
  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${GOOGLE_API_KEY}`;

  try {
    const response = await fetch(downloadUrl);
    if (!response.ok) throw new Error("파일 다운로드 실패");
    
    // 바이너리 버퍼로 변환하여 pdf.js로 전달
    const arrayBuffer = await response.arrayBuffer();
    
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdfDoc = await loadingTask.promise;
    return pdfDoc;
  } catch (err) {
    console.error("PDF 스트리밍 실패:", err);
    alert("악보를 불러오지 못했습니다.");
    return null;
  }
}
