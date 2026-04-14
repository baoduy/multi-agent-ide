Feature: Add Working Directory
  As a user on the welcome page
  I want to add a working directory containing git repositories
  So that Magenta IDE can discover and manage my repos

  Background:
    Given the app is launched with an empty home directory

  Scenario: Successfully add a directory and discover repos
    Given a test directory exists with git repos:
      | name          | branch  |
      | project-alpha | main    |
      | project-beta  | develop |
    And the native folder dialog will return the test directory path
    When I click "Add Working Directory"
    Then I should see the status "Adding directory..."
    And I should see the status "Scanning for repositories..."
    And eventually the dock layout should be visible

  Scenario: No repos found shows error
    Given a test directory exists with no git repos
    And the native folder dialog will return the test directory path
    When I click "Add Working Directory"
    Then I should eventually see the error "No git repositories found"

  Scenario: User cancels folder dialog
    Given the native folder dialog will be cancelled
    When I click "Add Working Directory"
    Then I should still see the heading "Welcome to Magenta IDE"
    And the "Add Working Directory" button should be enabled
