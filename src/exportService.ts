import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { CombinedClassGroup, WEEKDAYS, Student } from './types';

/**
 * Standard cell styling: thin borders, middle/center alignment, wrap text.
 */
const applyDefaultStyle = (cell: ExcelJS.Cell) => {
  cell.border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' },
  };
  cell.alignment = {
    vertical: 'middle',
    horizontal: 'center',
    wrapText: true,
  };
};

/**
 * Sorts students by className first, then by id.
 */
const sortStudents = (students: Student[]) => {
  return [...students].sort((a, b) => {
    const classCmp = (a.className || '').localeCompare(b.className || '');
    if (classCmp !== 0) return classCmp;
    return (a.id || '').localeCompare(b.id || '');
  });
};

/**
 * Sanitize sheet name for Excel (max 31 chars, no special chars)
 */
const sanitizeSheetName = (name: string, suffix: string) => {
  const illegalChars = /[\\/?:*[\]]/g;
  let cleanName = (name || '未命名').replace(illegalChars, '').trim();
  if (!cleanName) cleanName = '未命名';
  const maxLen = 31 - suffix.length;
  if (cleanName.length > maxLen) {
    cleanName = cleanName.substring(0, maxLen);
  }
  return `${cleanName}${suffix}`;
};

export const exportFullWorkbook = async (groups: CombinedClassGroup[], totalLabs: number = 10) => {
  const workbook = new ExcelJS.Workbook();
  const totalCols = 5 + totalLabs;

  // ==========================================================================
  // Sheet 1: 教师教室表 (排课矩阵)
  // ==========================================================================
  const sheet1 = workbook.addWorksheet('教师教室表');
  sheet1.mergeCells(1, 1, 1, totalCols);
  const s1Title = sheet1.getCell('A1');
  s1Title.value = '实验课教师教室安排表';
  s1Title.font = { size: 14, bold: true };
  applyDefaultStyle(s1Title);

  const s1Headers = ['上课周数', '星期', '节次', '学科', '班级'];
  // We want Lab 1 to Lab N from left to right for consistency
  for (let i = 1; i <= totalLabs; i++) s1Headers.push(`实验室${i}`);
  const s1HeaderRow = sheet1.addRow(s1Headers);
  s1HeaderRow.eachCell((cell) => {
    cell.font = { bold: true };
    applyDefaultStyle(cell);
  });

  let lastWeekday = '';
  let mergeStartRow = 3;

  const sortedGroups = [...groups].sort((a, b) => {
    if (a.time.weekday !== b.time.weekday) return a.time.weekday - b.time.weekday;
    return a.time.startWeek - b.time.startWeek;
  });

  sortedGroups.forEach((group, index) => {
    const currentWeekday = WEEKDAYS[group.time.weekday - 1] || `星期${group.time.weekday}`;
    
    // Format: Class1,Class2 32+30=62人
    const countsByClass: { [key: string]: number } = {};
    group.students.forEach(s => {
      countsByClass[s.className] = (countsByClass[s.className] || 0) + 1;
    });
    
    const validClassNames = (group.classNames || []).filter(name => name && name.trim() !== '');
    const countsStr = validClassNames.length > 0 
      ? validClassNames.map(name => countsByClass[name] || 0).join('+')
      : '0';
    const classInfo = validClassNames.length > 0
      ? `${validClassNames.join(',')} ${countsStr}=${group.totalStudents || 0}人`
      : `无班级信息 ${group.totalStudents || 0}人`;
    
    const rowData = [
      `${group.time?.startWeek || 1}-${group.time?.endWeek || 16}周`,
      currentWeekday,
      `${group.time?.session || '未知'}${group.time?.period || '未知节次'}`,
      group.courseName || '未命名课程',
      classInfo
    ];

    // Match labs 1 to totalLabs
    for (let i = 1; i <= totalLabs; i++) {
      const labName = `实验室${i}`;
      const assignment = group.assignments.find(a => a.labName === labName);
      rowData.push(assignment ? (assignment.teacherName || '') : '');
    }

    const row = sheet1.addRow(rowData);
    row.eachCell(cell => applyDefaultStyle(cell));

    // Vertical merge for Weekday
    if (index > 0 && currentWeekday !== lastWeekday) {
      if (mergeStartRow < row.number - 1) {
        sheet1.mergeCells(mergeStartRow, 2, row.number - 1, 2);
      }
      mergeStartRow = row.number;
    }
    if (index === sortedGroups.length - 1) {
      if (mergeStartRow < row.number) {
        sheet1.mergeCells(mergeStartRow, 2, row.number, 2);
      }
    }
    lastWeekday = currentWeekday;
  });

  sheet1.getColumn(1).width = 12;
  sheet1.getColumn(2).width = 10;
  sheet1.getColumn(3).width = 15;
  sheet1.getColumn(4).width = 20;
  sheet1.getColumn(5).width = 40;
  for (let i = 6; i <= 5 + totalLabs; i++) sheet1.getColumn(i).width = 12;


  // ==========================================================================
  // Sheet 2: 教室安排表 (号段表)
  // ==========================================================================
  const sheet2 = workbook.addWorksheet('教室安排表');
  let s2CurrentRow = 1;

  groups.forEach(group => {
    const courseName = group.courseName || '未命名课程';
    sheet2.mergeCells(`A${s2CurrentRow}:B${s2CurrentRow}`);
    const bHeader1 = sheet2.getCell(`A${s2CurrentRow}`);
    bHeader1.value = `《${courseName}》教室安排`;
    bHeader1.font = { bold: true, size: 12 };
    applyDefaultStyle(bHeader1);
    bHeader1.alignment = { horizontal: 'left', vertical: 'middle' };
    s2CurrentRow++;

    sheet2.mergeCells(`A${s2CurrentRow}:B${s2CurrentRow}`);
    const bHeader2 = sheet2.getCell(`A${s2CurrentRow}`);
    const weekday = group.time?.weekday ? (WEEKDAYS[group.time.weekday - 1] || '') : '';
    const timeStr = `${group.time?.startWeek || 1}-${group.time?.endWeek || 16}周 ${weekday} ${group.time?.session || ''}${group.time?.period || ''}`;
    bHeader2.value = `上课时间：${timeStr.trim() || '未设置'}`;
    applyDefaultStyle(bHeader2);
    bHeader2.alignment = { horizontal: 'left', vertical: 'middle' };
    s2CurrentRow++;

    const bHeader3_1 = sheet2.getCell(`A${s2CurrentRow}`);
    const bHeader3_2 = sheet2.getCell(`B${s2CurrentRow}`);
    bHeader3_1.value = '室号';
    bHeader3_2.value = '号数 (学号范围)';
    bHeader3_1.font = { bold: true };
    bHeader3_2.font = { bold: true };
    applyDefaultStyle(bHeader3_1);
    applyDefaultStyle(bHeader3_2);
    s2CurrentRow++;

    group.assignments.forEach((assign, idx) => {
      const row = sheet2.getRow(s2CurrentRow);
      const labCell = row.getCell(1);
      const rangeCell = row.getCell(2);
      
      labCell.value = assign.labName || `实验室${idx + 1}`;
      
      const sortedInLab = sortStudents(assign.studentRange.studentList);
      
      const studentsByClass: { [key: string]: Student[] } = {};
      sortedInLab.forEach(s => {
        if (!studentsByClass[s.className]) studentsByClass[s.className] = [];
        studentsByClass[s.className].push(s);
      });

      const rangeTexts = Object.entries(studentsByClass).map(([className, list]) => {
        const start = list[0]?.id || '？';
        const end = list[list.length - 1]?.id || '？';
        return `${className || '未知班级'}：${start} —— ${end}`;
      });

      rangeCell.value = rangeTexts.length > 0 ? rangeTexts.join('\n') : '无学生数据';
      applyDefaultStyle(labCell);
      applyDefaultStyle(rangeCell);
      s2CurrentRow++;
    });

    s2CurrentRow += 2; // Spacer
  });
  sheet2.getColumn(1).width = 20;
  sheet2.getColumn(2).width = 60;


  // ==========================================================================
  // Dynamic Sheets: [Course Name]成绩表 & [Course Name]座位安排表
  // ==========================================================================
  const uniqueCourseNames = Array.from(new Set(groups.map(g => g.courseName || '未命名课程')));

  uniqueCourseNames.forEach(courseName => {
    const courseGroups = groups.filter(g => (g.courseName || '未命名课程') === courseName);

    // --- Dynamic Sheet A: [Course Name]成绩表 ---
    const gradeSheetName = sanitizeSheetName(courseName, '-成绩表');
    const gradeSheet = workbook.addWorksheet(gradeSheetName);
    let gRow = 1;

    courseGroups.forEach(group => {
      group.assignments.forEach(assign => {
        // Row 1: Title
        gradeSheet.mergeCells(gRow, 1, gRow, 14);
        const h1 = gradeSheet.getCell(gRow, 1);
        h1.value = `${courseName} - ${assign.labName} 成绩单`;
        h1.font = { bold: true, size: 12 };
        applyDefaultStyle(h1);
        h1.alignment = { horizontal: 'left', vertical: 'middle' };
        gRow++;

        // Row 2 & 3: Headers
        const h2Row = gradeSheet.getRow(gRow);
        const h3Row = gradeSheet.getRow(gRow + 1);

        ['序号', '学号', '姓名'].forEach((text, i) => {
          h2Row.getCell(i + 1).value = text;
          applyDefaultStyle(h2Row.getCell(i + 1));
          applyDefaultStyle(h3Row.getCell(i + 1));
          gradeSheet.mergeCells(gRow, i + 1, gRow + 1, i + 1);
        });

        gradeSheet.mergeCells(gRow, 4, gRow, 12);
        const scoreCell = h2Row.getCell(4);
        scoreCell.value = '成绩';
        applyDefaultStyle(scoreCell);

        for(let i = 1; i <= 9; i++) {
          const cell = h3Row.getCell(i + 3);
          cell.value = i;
          applyDefaultStyle(cell);
          applyDefaultStyle(h2Row.getCell(i + 3));
        }

        h2Row.getCell(13).value = '班级';
        applyDefaultStyle(h2Row.getCell(13));
        applyDefaultStyle(h3Row.getCell(13));
        gradeSheet.mergeCells(gRow, 13, gRow + 1, 13);

        h2Row.getCell(14).value = '备注';
        applyDefaultStyle(h2Row.getCell(14));
        applyDefaultStyle(h3Row.getCell(14));
        gradeSheet.mergeCells(gRow, 14, gRow + 1, 14);

        gRow += 2;

        const sortedStudents = sortStudents(assign.studentRange.studentList);
        sortedStudents.forEach((student, idx) => {
          const rowData = [
            idx + 1, 
            student.id || '', 
            student.name || '', 
            '', '', '', '', '', '', '', '', '', 
            student.className || '', 
            ''
          ];
          const row = gradeSheet.addRow(rowData);
          row.eachCell(cell => applyDefaultStyle(cell));
          gRow++;
        });

        // Footer
        gradeSheet.mergeCells(gRow, 1, gRow, 14);
        const footer = gradeSheet.getCell(gRow, 1);
        const weekday = group.time?.weekday ? (WEEKDAYS[group.time.weekday - 1] || '') : '';
        const timeStr = `${group.time?.startWeek || 1}-${group.time?.endWeek || 16}周 ${weekday} ${group.time?.session || ''}${group.time?.period || ''}`;
        footer.value = `上课时间：${timeStr.trim() || '未设置'}   带教教师：${assign.teacherName || '未分配'}`;
        applyDefaultStyle(footer);
        footer.alignment = { horizontal: 'left', vertical: 'middle' };
        gRow += 4; 
      });
    });

    gradeSheet.getColumn(1).width = 6;
    gradeSheet.getColumn(2).width = 15;
    gradeSheet.getColumn(3).width = 12;
    gradeSheet.getColumn(13).width = 20;
    gradeSheet.getColumn(14).width = 15;
    for(let i = 4; i <= 12; i++) gradeSheet.getColumn(i).width = 5;

    // --- Dynamic Sheet B: [Course Name]座位安排表 ---
    const seatSheetName = sanitizeSheetName(courseName, '-座位表');
    const seatSheet = workbook.addWorksheet(seatSheetName);
    let sRow = 1;

    courseGroups.forEach(group => {
      group.assignments.forEach(assign => {
        // Header 1: Info
        seatSheet.mergeCells(`A${sRow}:K${sRow}`);
        const h1 = seatSheet.getCell(`A${sRow}`);
        const weekday = group.time?.weekday ? (WEEKDAYS[group.time.weekday - 1] || '') : '';
        const timeStr = `${group.time?.startWeek || 1}-${group.time?.endWeek || 16}周 ${weekday} ${group.time?.session || ''}${group.time?.period || ''}`;
        h1.value = `${courseName || '未命名课程'} | ${assign.labName || '未命名实验室'} | 教师：${assign.teacherName || '未分配'} | 时间：${timeStr.trim() || '未设置'}`;
        h1.font = { bold: true };
        applyDefaultStyle(h1);
        sRow++;

        // Header 2: Podium
        seatSheet.mergeCells(`A${sRow}:K${sRow}`);
        const h2 = seatSheet.getCell(`A${sRow}`);
        h2.value = '讲台';
        h2.font = { bold: true, size: 14 };
        applyDefaultStyle(h2);
        sRow++;

        // Header 3: Columns
        const h3Row = seatSheet.getRow(sRow);
        for (let i = 0; i < 4; i++) {
          const idCell = h3Row.getCell(i * 3 + 1);
          const nameCell = h3Row.getCell(i * 3 + 2);
          idCell.value = '学号';
          nameCell.value = '姓名';
          applyDefaultStyle(idCell);
          applyDefaultStyle(nameCell);
          if (i < 3) {
            const spacerCell = h3Row.getCell(i * 3 + 3);
            spacerCell.value = '';
            applyDefaultStyle(spacerCell);
            seatSheet.getColumn(i * 3 + 3).width = 2;
          }
        }
        sRow++;

        const students = sortStudents(assign.studentRange.studentList);
        const rows = Math.ceil(students.length / 4);
        const col1 = students.slice(0, rows);
        const col2 = students.slice(rows, rows * 2);
        const col3 = students.slice(rows * 2, rows * 3);
        const col4 = students.slice(rows * 3);

        const maxRows = Math.max(8, rows);

        for (let r = 0; r < maxRows; r++) {
          const rowData = new Array(11).fill('');
          if (col1[r]) { rowData[0] = col1[r].id; rowData[1] = col1[r].name; }
          if (col2[r]) { rowData[3] = col2[r].id; rowData[4] = col2[r].name; }
          if (col3[r]) { rowData[6] = col3[r].id; rowData[7] = col3[r].name; }
          if (col4[r]) { rowData[9] = col4[r].id; rowData[10] = col4[r].name; }
          
          const row = seatSheet.addRow(rowData);
          row.eachCell((cell, colNumber) => {
            if (colNumber !== 3 && colNumber !== 6 && colNumber !== 9) {
               applyDefaultStyle(cell);
            } else {
               cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
            }
          });
          sRow++;
        }

        sRow += 4; // Spacer
      });
    });
    seatSheet.columns.forEach((col, i) => {
      const colIdx = i + 1;
      if ([3, 6, 9].includes(colIdx)) col.width = 2;
      else col.width = 12;
    });
  });

  const now = new Date();
  const dateStr = now.getFullYear().toString() + 
                  (now.getMonth() + 1).toString().padStart(2, '0') + 
                  now.getDate().toString().padStart(2, '0');
  
  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer]), `实验室排课方案_${dateStr}.xlsx`);
};
