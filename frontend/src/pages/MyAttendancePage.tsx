import { Link } from "react-router-dom";
import AdminLayout from "../components/AdminLayout";
import MyAttendance from "../components/MyAttendance";
export default function MyAttendancePage(){return <AdminLayout active="dashboard" title="My attendance" subtitle="Your required dates, recorded hours and attendance details." right={<Link className="attendance-secondary" to="/dashboard">Back to dashboard</Link>}><MyAttendance full/></AdminLayout>}
