const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'tasks.db');
const db = new sqlite3.Database(dbPath);

// 查询被归档的任务
const archivedTaskId = '2cf82359-e35a-4efc-8a89-330fe411e83e-archived-2025-08-12T03-47-27-755Z';

db.get(`
  SELECT 
    task_id, 
    json_extract(progress, '$.status') as progress_status,
    current_step,
    step_status,
    finish_reason,
    is_valid_complete,
    last_step_completed_at,
    LENGTH(outputs) as outputs_length,
    SUBSTR(outputs, 1, 200) as outputs_preview
  FROM tasks 
  WHERE task_id = ?
`, [archivedTaskId], (err, row) => {
  if (err) {
    console.error('Error querying database:', err);
  } else if (row) {
    console.log('Found archived task:');
    console.log(JSON.stringify(row, null, 2));
    
    // 检查outputs是否包含final-report
    db.get(`
      SELECT 
        outputs,
        LENGTH(outputs) as full_length
      FROM tasks 
      WHERE task_id = ?
    `, [archivedTaskId], (err2, fullRow) => {
      if (err2) {
        console.error('Error getting full outputs:', err2);
      } else if (fullRow) {
        const outputs = JSON.parse(fullRow.outputs);
        console.log('\nOutputs analysis:');
        console.log('Number of output chunks:', outputs.length);
        
        const finalReportChunks = outputs.filter(output => 
          output.includes('<final-report>') || output.includes('</final-report>')
        );
        
        console.log('Final report chunks found:', finalReportChunks.length);
        
        if (finalReportChunks.length > 0) {
          console.log('Sample final-report content:');
          finalReportChunks.forEach((chunk, index) => {
            console.log(`Chunk ${index + 1}:`, chunk.substring(0, 100) + '...');
          });
        }
        
        // 检查是否有完整的final-report
        const hasCompleteFinalReport = outputs.some(output => {
          const hasStart = output.includes('<final-report>');
          const hasEnd = output.includes('</final-report>');
          const hasContent = output.length > 1000;
          return hasStart && hasEnd && hasContent;
        });
        
        console.log('Has complete final-report:', hasCompleteFinalReport);
      }
      db.close();
    });
  } else {
    console.log('Task not found in database');
    db.close();
  }
});