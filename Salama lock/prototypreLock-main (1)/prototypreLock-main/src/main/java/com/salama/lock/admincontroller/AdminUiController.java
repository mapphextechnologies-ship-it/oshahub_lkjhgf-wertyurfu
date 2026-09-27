package com.salama.lock.admincontroller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class AdminUiController {

    @GetMapping({"/admin", "/admin/"})
    public String issueKeyPage() {
        return "forward:/admin/index.html";
    }

    @GetMapping({"/admin/data", "/admin/data/"})
    public String dataBrowserPage() {
        return "forward:/admin/data.html";
    }

    @GetMapping({"/admin/monitor", "/admin/monitor/"})
    public String monitorPage() {
        return "forward:/admin/monitor.html";
    }

    @GetMapping({"/admin/companies", "/admin/companies/"})
    public String companiesPage() {
        return "forward:/admin/companies.html";
    }

    @GetMapping({"/guide", "/guide/"})
    public String guidePage() {
        return "forward:/guide.html";
    }
}
