//! The one running export: lets `cancel_export` stop FFmpeg while `run_ffmpeg_export` is still reading its output.
//!
//! The child process lives here instead of inside the command so another command can kill it. Only one export runs at
//! a time (a second `run_ffmpeg_export` is refused while the slot is taken).

use std::process::{Child, ExitStatus};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

#[derive(Default)]
pub struct ExportJob {
    child: Mutex<Option<Child>>,
    running: AtomicBool,
    cancelled: AtomicBool,
}

impl ExportJob {
    /// Claims the slot. False when an export is already running.
    pub fn try_begin(&self) -> bool {
        let claimed = self
            .running
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok();
        if claimed {
            self.cancelled.store(false, Ordering::SeqCst);
        }
        claimed
    }

    /// Gives the slot back without a process (FFmpeg could not be started)
    pub fn release(&self) {
        self.running.store(false, Ordering::SeqCst);
    }

    /// Hands the started process over. A cancel that arrived while FFmpeg was starting kills it right away.
    pub fn attach(&self, child: Child) {
        let mut guard = self.child.lock().unwrap();
        *guard = Some(child);
        if self.cancelled.load(Ordering::SeqCst) {
            if let Some(c) = guard.as_mut() {
                let _ = c.kill();
            }
        }
    }

    /// Stops the running export. False when none is running.
    pub fn cancel(&self) -> bool {
        if !self.running.load(Ordering::SeqCst) {
            return false;
        }
        self.cancelled.store(true, Ordering::SeqCst);
        if let Some(c) = self.child.lock().unwrap().as_mut() {
            let _ = c.kill();
        }
        true
    }

    /// Waits for the process, frees the slot and tells how it ended: (exit status, was cancelled)
    pub fn finish(&self) -> (Option<ExitStatus>, bool) {
        let child = self.child.lock().unwrap().take();
        let status = child.and_then(|mut c| c.wait().ok());
        let cancelled = self.cancelled.swap(false, Ordering::SeqCst);
        self.running.store(false, Ordering::SeqCst);
        (status, cancelled)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::{Command, Stdio};

    /// A process that lives long enough to be killed (Windows: `ping` with a count)
    fn long_process() -> Child {
        Command::new("ping")
            .args(["-n", "30", "127.0.0.1"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("ping starts")
    }

    #[test]
    fn only_one_export_runs_at_a_time() {
        let job = ExportJob::default();
        assert!(job.try_begin());
        assert!(!job.try_begin());
        job.release();
        assert!(job.try_begin());
    }

    #[test]
    fn cancel_without_a_running_export_does_nothing() {
        assert!(!ExportJob::default().cancel());
    }

    #[test]
    fn cancel_kills_the_process_and_frees_the_slot() {
        let job = ExportJob::default();
        assert!(job.try_begin());
        job.attach(long_process());
        assert!(job.cancel());

        let (status, cancelled) = job.finish();
        assert!(cancelled);
        assert!(!status.expect("process was waited for").success());
        assert!(job.try_begin(), "the slot is free again");
    }

    #[test]
    fn a_cancel_during_startup_kills_the_process_as_soon_as_it_is_attached() {
        let job = ExportJob::default();
        assert!(job.try_begin());
        assert!(job.cancel()); // no process yet
        job.attach(long_process());

        let (status, cancelled) = job.finish();
        assert!(cancelled);
        assert!(!status.unwrap().success());
    }

    #[test]
    fn a_finished_export_is_not_reported_as_cancelled() {
        let job = ExportJob::default();
        assert!(job.try_begin());
        let quick = Command::new("cmd").args(["/C", "exit", "0"]).spawn().unwrap();
        job.attach(quick);
        let (status, cancelled) = job.finish();
        assert!(!cancelled);
        assert!(status.unwrap().success());
    }
}
